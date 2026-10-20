import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from experiment_selector import PROJECT_ROOT, get_planner_state, load_scenario


HOST = "127.0.0.1"
PORT = 8000

SCENARIO_FILES = {
    "demo": PROJECT_ROOT / "data" / "demo-scenario.json",
    "propranolol": PROJECT_ROOT / "data" / "propranolol-scenario.json",
    "xanomeline": PROJECT_ROOT / "data" / "xanomeline-pdp-scenario.json",
}


class PlannerRequestHandler(BaseHTTPRequestHandler):
    def send_json(self, status_code, payload):
        response_body = json.dumps(payload).encode("utf-8")

        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response_body)

    def do_GET(self):
        parsed_url = urlparse(self.path)

        if parsed_url.path != "/api/planner":
            self.send_json(404, {"error": "Not found"})
            return

        query = parse_qs(parsed_url.query)
        scenario_key = query.get("scenario", ["demo"])[0]

        if scenario_key not in SCENARIO_FILES:
            self.send_json(
                400,
                {
                    "error": "Unknown scenario",
                    "allowed_scenarios": sorted(SCENARIO_FILES),
                },
            )
            return

        scenario = load_scenario(SCENARIO_FILES[scenario_key])
        planner_state = get_planner_state(scenario, scenario_key)
        self.send_json(200, planner_state)

    def log_message(self, format, *args):
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), format % args))


def main():
    server = ThreadingHTTPServer((HOST, PORT), PlannerRequestHandler)
    print("Planner API running at http://" + HOST + ":" + str(PORT))
    print("Available endpoint: /api/planner?scenario=demo|propranolol|xanomeline")
    server.serve_forever()


if __name__ == "__main__":
    main()
