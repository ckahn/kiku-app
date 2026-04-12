'use client';

interface LocalDateTimeProps {
  iso: string;
}

export default function LocalDateTime({ iso }: LocalDateTimeProps) {
  return <>{new Date(iso).toLocaleString()}</>;
}
