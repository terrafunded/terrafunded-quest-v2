import { useEffect, useState } from "react";

const SM = "(min-width: 640px)";

/** True at Tailwind's `sm` breakpoint and up; charts read it to drop detail on narrow screens. */
export function useWideViewport(): boolean {
  const [wide, setWide] = useState(() => (typeof window !== "undefined" ? window.matchMedia(SM).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(SM);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}
