import type { Variants } from 'framer-motion';

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};
