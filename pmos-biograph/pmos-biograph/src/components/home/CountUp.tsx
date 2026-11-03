import { animate, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/** A number that counts up from zero the first time it is on screen. Shows the final value at once if motion is reduced. */
export function CountUp({ to, className = '' }: { to: number | undefined; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (to === undefined || !inView) return;
    if (reduce) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, { duration: 1.8, ease: 'easeOut', onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [to, inView, reduce]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {to === undefined ? '–' : value.toLocaleString('en-US')}
    </span>
  );
}
