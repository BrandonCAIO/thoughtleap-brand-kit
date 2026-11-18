/**
 * First three beats of the user's six-frame whiteboard. All values are analytic
 * functions of phase, so reverse seeking and arbitrary frame order are exact.
 * Angular speed is integrated, rather than tweening independent angle segments.
 */
export function evaluateReelLaunch(progress=0,motionAmount=1) {
  const p=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0));
  const amount=Number.isFinite(motionAmount)?Math.max(0,motionAmount):1;
  const slow=.75,fast=11,accelerationSpan=.3;
  let turns;
  if(p<=.4)turns=slow*p;
  else if(p<.7) {
    const u=(p-.4)/accelerationSpan;
    // Integral of velocity slow + (fast-slow)*(3u²-2u³).
    // Velocity and acceleration both join continuously at phases .4 and .7.
    turns=slow*.4+accelerationSpan*(slow*u+(fast-slow)*(u*u*u-.5*u*u*u*u));
  }else turns=slow*.4+accelerationSpan*(slow+fast)/2+fast*(p-.7);
  const launch=Math.max(0,(p-.7)/.25);
  // Cubic flight begins with zero velocity and acceleration. It keeps traveling
  // beyond .95, instead of visibly braking or shrinking the physical object.
  return {angle:turns*Math.PI*2*amount,distance:32*launch*launch*launch};
}
