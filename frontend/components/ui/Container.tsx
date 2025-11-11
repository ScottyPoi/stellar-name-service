import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export function Container({ children, className }: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full max-w-3xl px-6 ${className ? className : ""}`}
    >
      {children}
    </div>
  );
}
