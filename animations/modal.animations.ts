import type { Variants } from 'framer-motion';

export const slideInFromRight: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', damping: 25, stiffness: 300 },
  },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

export const overlayFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};
