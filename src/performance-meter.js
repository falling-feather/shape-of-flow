function percentile(values,q){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(q*(sorted.length-1)))];}

/** Bounded samples of active frame cadence. CPU submission time is not GPU time. */
export class PerformanceMeter {
  constructor(){this.sample=null;this.lastReport=null;}
  start(label,device,now=performance.now(),duration=10000){
    this.sample={label,device,started:now,duration,lastActive:null,intervals:[],submission:[],hiddenFrames:0,unfocusedFrames:0,simulatedSteps:0,drawnFrames:0,
      visible:true,hiddenAt:null,hiddenDurationMs:0,hiddenTransitions:0,focused:true,unfocusedAt:null,unfocusedDurationMs:0,focusTransitions:0};
    this.visibility(now,device.visibility!=='hidden');this.focus(now,device.documentFocused!==false);
  }
  visibility(now,visible){
    const s=this.sample;if(!s||s.visible===visible)return;
    s.visible=visible;s.lastActive=null;
    if(!visible){s.hiddenAt=now;s.hiddenTransitions++;}
    else if(s.hiddenAt!==null){s.hiddenDurationMs+=now-s.hiddenAt;s.hiddenAt=null;}
  }
  focus(now,focused){
    const s=this.sample;if(!s||s.focused===focused)return;
    s.focused=focused;s.focusTransitions++;
    if(!focused)s.unfocusedAt=now;
    else if(s.unfocusedAt!==null){s.unfocusedDurationMs+=now-s.unfocusedAt;s.unfocusedAt=null;}
  }
  frame(now,{active,visible=true,focused=true,drawn=false,submissionMs=0,steps=0}){
    const s=this.sample;if(!s)return null;
    now=Math.max(now,s.started);
    this.visibility(now,visible);this.focus(now,focused);
    if(active&&visible){if(!focused)s.unfocusedFrames++;if(s.lastActive!==null&&s.intervals.length<4096)s.intervals.push(now-s.lastActive);s.lastActive=now;s.simulatedSteps+=steps;if(drawn){s.drawnFrames++;if(s.submission.length<4096)s.submission.push(submissionMs);}}
    else{s.lastActive=null;if(!visible)s.hiddenFrames++;}
    if(now-s.started<s.duration)return null;
    const ms=s.intervals.reduce((sum,x)=>sum+x,0);
    this.lastReport={sampler:'visibility-events-1',label:s.label,device:s.device,wallMs:now-s.started,activeFrameCount:s.intervals.length,activeMs:ms,drawnFrames:s.drawnFrames,simulatedSteps:s.simulatedSteps,hiddenFrames:s.hiddenFrames,unfocusedFrames:s.unfocusedFrames,
      hiddenDurationMs:s.hiddenDurationMs+(s.hiddenAt===null?0:now-s.hiddenAt),hiddenTransitions:s.hiddenTransitions,unfocusedDurationMs:s.unfocusedDurationMs+(s.unfocusedAt===null?0:now-s.unfocusedAt),focusTransitions:s.focusTransitions,
      meanFps:ms>0?s.intervals.length*1000/ms:null,medianFrameMs:s.intervals.length?percentile(s.intervals,.5):null,p95FrameMs:s.intervals.length?percentile(s.intervals,.95):null,
      p99FrameMs:s.intervals.length?percentile(s.intervals,.99):null,maxFrameMs:s.intervals.length?Math.max(...s.intervals):null,largestFrameGapsMs:[...s.intervals].sort((a,b)=>b-a).slice(0,5),windowActivityFps:s.intervals.length*1000/(now-s.started),
      medianCpuSubmissionMs:s.submission.length?percentile(s.submission,.5):null,p95CpuSubmissionMs:s.submission.length?percentile(s.submission,.95):null,gpuTimeMeasured:false};
    this.sample=null;return this.lastReport;
  }
}
