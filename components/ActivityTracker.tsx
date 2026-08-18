"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordPageView } from "@/lib/supabase/activityLogData";
import { getActiveProjectId } from "@/lib/storage";
export default function ActivityTracker(){const pathname=usePathname();useEffect(()=>{void recordPageView(getActiveProjectId(),pathname)},[pathname]);return null}
