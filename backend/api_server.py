import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from llm_reasoner import (
    build_explanation_context,
    explain_recommendation,
)

from experiment_selector import (
    PROJECT_ROOT,
    apply_experiment_result,
    create_session_state,
    get_planner_state,
    get_session_planner_state,
    load_scenario,
    normalize_qc,
    reveal_historical_result,
    serialize_session_status,
)


HOST = "127.0.0.1"
PORT = 8000

SCENARIO_FILES = {
    "demo": PROJECT_ROOT / "data" / "demo-scenario.json",
    "propranolol": PROJECT_ROOT / "data" / "propranolol-scenario-v2.json",
    "propranolol-v1": PROJECT_ROOT / "data" / "propranolol-scenario.json",
    "xanomeline": PROJECT_ROOT / "data" / "xanomeline-pdp-scenario.json",
}

sessions = {}
sessions_lock = Lock()

def build_llm_explanation(planner_state):
    context = build_explanation_context(planner_state)

    if context is None:
        return {
            "recommendation_explanation": (
                "No experiment is currently recommended."
            )
        }

    return explain_recommendation(context)


class PlannerRequestHandler(BaseHTTPRequestHandler):
    def send_json(self, status_code, payload):
        response_body = json.dumps(payload).encode("utf-8")

        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response_body)

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))

        if content_length == 0:
            return {}

        request_body = self.rfile.read(content_length)

        try:
            return json.loads(request_body.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_url = urlparse(self.path)

        if parsed_url.path == "/api/planner":
            self.handle_planner_get(parsed_url)
            return
        if parsed_url.path == "/api/explain":
            self.handle_explanation_get(parsed_url)
            return

        path_parts = parsed_url.path.strip("/").split("/")

        if len(path_parts) == 3 and path_parts[:2] == ["api", "sessions"]:
            self.handle_session_get(path_parts[2])
            return

        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        parsed_url = urlparse(self.path)
        path_parts = parsed_url.path.strip("/").split("/")

        if path_parts == ["api", "sessions"]:
            self.handle_session_create()
            return

        if (
            len(path_parts) == 4
            and path_parts[:2] == ["api", "sessions"]
            and path_parts[3] == "result"
        ):
            self.handle_session_result(path_parts[2])
            return

        if (
            len(path_parts) == 4
            and path_parts[:2] == ["api", "sessions"]
            and path_parts[3] == "reveal-historical-result"
        ):
            self.handle_historical_reveal(path_parts[2])
            return

        self.send_json(404, {"error": "Not found"})

    def get_scenario_key_from_query(self, parsed_url):
        query = parse_qs(parsed_url.query)
        return query.get("scenario", ["demo"])[0]

    def load_scenario_by_key(self, scenario_key):
        if scenario_key not in SCENARIO_FILES:
            return None

        return load_scenario(SCENARIO_FILES[scenario_key])

    def handle_planner_get(self, parsed_url):
        scenario_key = self.get_scenario_key_from_query(parsed_url)
        scenario = self.load_scenario_by_key(scenario_key)

        if scenario is None:
            self.send_json(
                400,
                {
                    "error": "Unknown scenario",
                    "allowed_scenarios": sorted(SCENARIO_FILES),
                },
            )
            return

        self.send_json(
            200,
            get_planner_state(scenario, scenario_key),
        )

    def handle_explanation_get(self, parsed_url):
        scenario_key = self.get_scenario_key_from_query(parsed_url)
        scenario = self.load_scenario_by_key(scenario_key)

        if scenario is None:
            self.send_json(
                400,
                {
                    "error": "Unknown scenario",
                    "allowed_scenarios": sorted(SCENARIO_FILES),
                },
            )
            return

        planner_state = get_planner_state(
            scenario,
            scenario_key,
        )

        explanation = build_llm_explanation(
            planner_state
        )

        self.send_json(
            200,
            {
                "scenario": scenario_key,
                "recommendation": planner_state["recommendation"],
                "llm_explanation": explanation,
            },
        )

    def handle_session_create(self):
        request_json = self.read_json_body()

        if request_json is None:
            self.send_json(400, {"error": "Malformed JSON"})
            return

        scenario_key = request_json.get("scenario", "demo")
        scenario = self.load_scenario_by_key(scenario_key)

        if scenario is None:
            self.send_json(
                400,
                {
                    "error": "Unknown scenario",
                    "allowed_scenarios": sorted(SCENARIO_FILES),
                },
            )
            return

        session_id = str(uuid4())
        session_state = create_session_state(scenario_key, scenario)

        with sessions_lock:
            sessions[session_id] = session_state

        self.send_json(
            200,
            {
                "session_id": session_id,
                "session": serialize_session_status(session_state),
                "planner_state": get_session_planner_state(session_state),
            },
        )

    def handle_session_get(self, session_id):
        with sessions_lock:
            session_state = sessions.get(session_id)

            if session_state is None:
                self.send_json(404, {"error": "Unknown session"})
                return

            response = {
                "session_id": session_id,
                "session": serialize_session_status(session_state),
                "planner_state": get_session_planner_state(session_state),
            }

        self.send_json(200, response)

    def handle_historical_reveal(self, session_id):
        with sessions_lock:
            session_state = sessions.get(session_id)

            if session_state is None:
                self.send_json(404, {"error": "Unknown session"})
                return

            if session_state["terminated"]:
                self.send_json(409, {"error": "Session is terminated"})
                return

            try:
                reveal = reveal_historical_result(session_state)
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
                return

            response = {
                "session_id": session_id,
                **reveal,
            }

        self.send_json(200, response)

    def handle_session_result(self, session_id):
        request_json = self.read_json_body()

        if request_json is None:
            self.send_json(400, {"error": "Malformed JSON"})
            return

        experiment_id = request_json.get("experiment_id")
        result = request_json.get("result")
        qc = request_json.get("qc", "pass")

        if result not in ["positive", "negative", "inconclusive"]:
            self.send_json(
                400,
                {
                    "error": "Invalid result",
                    "allowed_values": ["positive", "negative", "inconclusive"],
                },
            )
            return

        try:
            normalize_qc(qc)
        except ValueError:
            self.send_json(
                400,
                {
                    "error": "Invalid QC",
                    "allowed_values": ["pass", "questionable", "fail"],
                },
            )
            return

        if not experiment_id:
            self.send_json(400, {"error": "Missing experiment_id"})
            return

        with sessions_lock:
            session_state = sessions.get(session_id)

            if session_state is None:
                self.send_json(404, {"error": "Unknown session"})
                return

            if session_state["terminated"]:
                self.send_json(409, {"error": "Session is terminated"})
                return

            try:
                transition = apply_experiment_result(
                    session_state,
                    experiment_id,
                    result,
                    qc,
                )
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
                return

            response = {
                "session_id": session_id,
                **transition,
            }

        self.send_json(200, response)

    def log_message(self, format, *args):
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), format % args))


def main():
    server = ThreadingHTTPServer((HOST, PORT), PlannerRequestHandler)
    print("Planner API running at http://" + HOST + ":" + str(PORT))
    print("Available endpoints:")
    print("  GET  /api/planner?scenario=demo|propranolol|propranolol-v1|xanomeline")
    print("  POST /api/sessions")
    print("  GET  /api/sessions/{session_id}")
    print("  POST /api/sessions/{session_id}/result")
    print("  POST /api/sessions/{session_id}/reveal-historical-result")
    print("  GET  /api/explain?scenario=demo|propranolol|propranolol-v1|xanomeline")
    server.serve_forever()


if __name__ == "__main__":
    main()
