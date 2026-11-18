const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=u=>{u=clamp(u);return u*u*u*(10-15*u+6*u*u);};

/** Exact time integral of a smoothly accelerating angular velocity. No history. */
export function evaluateRocketLaunch(progress=0,{motionDuration=10,spinSpeed=4,heatStrength=1,trailStrength=1}={}) {
  const p=clamp(Number.isFinite(progress)?progress:0);
  const duration=Math.max(.1,Number.isFinite(motionDuration)?motionDuration:10);
  const peak=Math.max(.05,Number.isFinite(spinSpeed)?spinSpeed:4);
  const slow=.065,accelerationEnd=.75,u=Math.min(1,p/accelerationEnd);
  const velocityMix=smooth(u),speed=slow+(peak-slow)*velocityMix;
  // Integral of 10u³-15u⁴+6u⁵ = 2.5u⁴-3u⁵+u⁶.
  const integral=2.5*u**4-3*u**5+u**6;
  const turns=duration*(accelerationEnd*(slow*u+(peak-slow)*integral)+Math.max(0,p-accelerationEnd)*peak);
  const thermal=Math.pow(velocityMix,1.35)*Math.max(0,heatStrength);
  const launch=Math.max(0,(p-.78)/.18),distance=40*launch**3;
  const ignition=smooth((p-.755)/.035)*Math.max(0,trailStrength);
  return {angle:turns*Math.PI*2,speed,heat:clamp(thermal),heatEnergy:thermal,distance,trail:ignition,trailLength:Math.min(14,.55+distance*.84)};
}
