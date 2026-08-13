import DemoReviewApp from "@/components/demo/DemoReviewApp";
export default async function DemoPage({searchParams}:{searchParams:Promise<{view?:string}>}) {
  return <DemoReviewApp initialView={(await searchParams).view || "/dashboard"}/>;
}
