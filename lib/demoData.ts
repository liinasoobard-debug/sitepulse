export type DemoState = {
  date: string;
  activities: Array<{id:string;name:string;product:string;area:string;start:string;finish:string;quantity:number;unit:string;plannedMd:number;progress:number;predecessor:string;rag:"GREEN"|"AMBER"|"RED"}>;
  allocations: Array<{id:string;gang:string;operatives:number;activityId:string;expected:number;target:number;actual:number;targetPf:number;actualPf:number;readiness:"GREEN"|"AMBER"|"RED"}>;
  constraints: Array<{id:string;rag:"GREEN"|"AMBER"|"RED";status:string;activityId:string;description:string;category:string;owner:string;required:string;days:number;update:string;relationship:string}>;
  handoverRecorded: boolean;
  exceptionRecorded: boolean;
  plantOffHireRequested: boolean;
};

export const initialDemoState: DemoState = {
  date:"2026-08-13",
  activities:[
    {id:"SP-D100",name:"CW Stick L04",product:"Curtain Wall",area:"North L04",start:"2026-08-10",finish:"2026-08-14",quantity:180,unit:"m²",plannedMd:6,progress:85,predecessor:"—",rag:"GREEN"},
    {id:"SP-D110",name:"CW Glazing L04",product:"Curtain Wall",area:"North L04",start:"2026-08-13",finish:"2026-08-20",quantity:280,unit:"m²",plannedMd:7,progress:32,predecessor:"SP-D100",rag:"RED"},
    {id:"SP-D200",name:"Composite Cladding L02",product:"Composite Cladding",area:"South L02",start:"2026-08-11",finish:"2026-08-21",quantity:420,unit:"m²",plannedMd:8,progress:48,predecessor:"SP-D100",rag:"AMBER"},
    {id:"SP-D300",name:"Window Units L03",product:"Windows",area:"East L03",start:"2026-08-17",finish:"2026-08-28",quantity:36,unit:"nr",plannedMd:2,progress:0,predecessor:"SP-D200",rag:"GREEN"},
    {id:"SP-M400",name:"North Elevation Watertight",product:"Milestone",area:"North",start:"2026-08-28",finish:"2026-08-28",quantity:0,unit:"milestone",plannedMd:0,progress:0,predecessor:"SP-D110",rag:"AMBER"},
  ],
  allocations:[
    {id:"A1",gang:"Gang A",operatives:6,activityId:"SP-D110",expected:42,target:48,actual:44,targetPf:.88,actualPf:.95,readiness:"AMBER"},
    {id:"A2",gang:"Gang B",operatives:5,activityId:"SP-D200",expected:40,target:38,actual:34,targetPf:1.05,actualPf:1.18,readiness:"GREEN"},
    {id:"A3",gang:"Gang C",operatives:4,activityId:"SP-D100",expected:24,target:24,actual:25,targetPf:1,actualPf:.96,readiness:"GREEN"},
  ],
  constraints:[
    {id:"CON-101",rag:"RED",status:"OPEN",activityId:"SP-D110",description:"Glass delivery unconfirmed",category:"Materials",owner:"A. Reviewer",required:"2026-08-12",days:8,update:"Supplier confirmation requested",relationship:"Blocking Start"},
    {id:"CON-102",rag:"AMBER",status:"OPEN",activityId:"SP-D200",description:"Crane availability",category:"Plant",owner:"B. Planner",required:"2026-08-14",days:5,update:"Shared lift window proposed",relationship:"Blocking Progress"},
    {id:"CON-103",rag:"GREEN",status:"CLOSED",activityId:"SP-D100",description:"Access release controlled",category:"Access",owner:"C. Manager",required:"2026-08-10",days:2,update:"Access released and verified",relationship:"Blocking Start"},
  ],
  handoverRecorded:false, exceptionRecorded:true, plantOffHireRequested:false,
};
