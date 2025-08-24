'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { motion, type Transition } from 'motion/react';

export type GlowEffectProps = {
  className?: string;
  style?: React.CSSProperties;
  colors?: string[];
  mode?: 'rotate' | 'pulse' | 'breathe' | 'colorShift' | 'flowHorizontal' | 'static';
  blur?: number | 'soft' | 'normal' | 'medium' | 'strong' | 'stronger' | 'none';
  transition?: Transition;
  scale?: number;
  duration?: number;
};

export function GlowEffect({
  className,
  style,
  colors = ['#FF5733', '#33FF57', '#3357FF', '#F1C40F'],
  mode = 'colorShift',
  blur = 'medium',
  transition,
  scale = 1,
  duration = 4,
}: GlowEffectProps) {
  const BASE_TRANSITION: Transition = {
  repeat: Infinity,
  duration,
  ease: (t) => t, // linear
};


  const animations: Record<
    NonNullable<GlowEffectProps['mode']>,
    Record<string, any>
  > = {
    rotate: {
      background: [
        `conic-gradient(from 0deg at 50% 50%, ${colors.join(', ')})`,
        `conic-gradient(from 360deg at 50% 50%, ${colors.join(', ')})`,
      ],
      transition: {
        ...(transition ?? BASE_TRANSITION),
      },
    },
    pulse: {
      background: colors.map(
        (color) =>
          `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 100%)`,
      ),
      scale: [1 * scale, 1.1 * scale, 1 * scale],
      opacity: [0.5, 0.8, 0.5],
      transition: {
        ...(transition ?? {
          ...BASE_TRANSITION,
          repeatType: 'mirror',
        }),
      },
    },
    breathe: {
      background: colors.map(
        (color) =>
          `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 100%)`,
      ),
      scale: [1 * scale, 1.05 * scale, 1 * scale],
      transition: {
        ...(transition ?? {
          ...BASE_TRANSITION,
          repeatType: 'mirror',
        }),
      },
    },
    colorShift: {
      background: colors.map((color, index) => {
        const nextColor = colors[(index + 1) % colors.length];
        return `conic-gradient(from 0deg at 50% 50%, ${color} 0%, ${nextColor} 50%, ${color} 100%)`;
      }),
      transition: {
        ...(transition ?? {
          ...BASE_TRANSITION,
          repeatType: 'mirror',
        }),
      },
    },
    flowHorizontal: {
      background: colors.map((color, i) => {
        const nextColor = colors[(i + 1) % colors.length];
        return `linear-gradient(to right, ${color}, ${nextColor})`;
      }),
      transition: {
        ...(transition ?? {
          ...BASE_TRANSITION,
          repeatType: 'mirror',
        }),
      },
    },
    static: {
      background: `linear-gradient(to right, ${colors.join(', ')})`,
    },
  };

const getBlurClass = (b: GlowEffectProps['blur']) => {
  if (typeof b === 'number') return null; // numérico vai via style.filter

  const presets = {
    none: 'blur-none',
    soft: 'blur-sm',
    normal: 'blur',     // ~8px
    medium: 'blur-md',
    strong: 'blur-lg',
    stronger: 'blur-xl',
  } as const;

  return presets[b as keyof typeof presets] ?? 'blur-md';
};

  // Se blur for numérico, usamos filter inline para não depender de safelist
  const numericBlur = typeof blur === 'number' ? blur : null;

  return (
    <motion.div
      style={
        {
          ...style,
          ...(numericBlur !== null ? { filter: `blur(${numericBlur}px)` } : {}),
          // pequenas otimizações de render
          willChange: 'transform, background, opacity',
          backfaceVisibility: 'hidden',
          '--scale': scale,
        } as React.CSSProperties
      }
      animate={animations[mode]}
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full',
        'scale-[var(--scale)] transform-gpu',
        getBlurClass(blur),
        className,
      )}
    />
  );
}
