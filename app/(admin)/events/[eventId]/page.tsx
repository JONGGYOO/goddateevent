"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/kit";

export default function EventIndex() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/events/${eventId}/participants`);
  }, [eventId, router]);
  return <Loading />;
}
