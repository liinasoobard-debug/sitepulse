import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET() {
  const rows = [{
    "Programme Activity ID": "SP-001", Building: "Building A", Elevation: "North", Level: "01", Activity: "Install curtain wall",
    "Product Type": "Unitised Curtain Wall", Unit: "m2", "Planned Quantity": 100, "Planned Start": "2026-08-10", "Planned Finish": "2026-08-21",
    "Budget Labour Hours": 50, "Planned Production Rate": "", "Planned Crew Size": 5, Trade: "Facades", WBS: "1.1", Status: "Not Started",
  }];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = Object.keys(rows[0]).map((heading) => ({ wch: Math.max(14, heading.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, "SitePulse Programme");
  const content = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(content, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="SitePulse-Programme-Template.xlsx"', "cache-control": "no-store" } });
}
