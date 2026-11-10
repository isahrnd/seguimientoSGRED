"use client";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "antd";

/** Un solo elemento interactivo (un `<a>` con estilo de botón): una parada de tabulación y navegación sin recarga. */
export function BotonEnlace({ href, children, ...props }: Omit<ButtonProps, "href"> & { href: string }) {
  const router = useRouter();
  return (
    <Button
      {...props}
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        router.push(href);
      }}
    >
      {children}
    </Button>
  );
}
