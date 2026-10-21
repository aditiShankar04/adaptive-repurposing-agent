import { useEffect } from 'react'

export default function useInert(ref, inert) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (inert) element.setAttribute('inert', '')
    else element.removeAttribute('inert')
  }, [ref, inert])
}
