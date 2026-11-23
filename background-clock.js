import {StudyClock} from './clock.js';
// An explicit room policy permits elapsed time. It is independent of camera proof.
export class BackgroundClock extends StudyClock {
 constructor(start,minutes=60,wallNow=()=>Date.now()) {super(start,Infinity);this.wallNow=wallNow;this.wallStart=wallNow();this.limit=minutes*60000;this.background=false;this.deadline=Infinity;this.expired=false;}
 now(){return this.start+Math.max(0,this.wallNow()-this.wallStart)}
 observe(_now,present){const now=this.now(),cap=this.background?this.deadline:(this.last??this.start)+this.limit;
  if(present&&this.present&&now>cap){super.observe(Math.max(cap,this.last??this.start),true);super.observe(now,false);this.expired=true;return}
  super.observe(now,present&&!this.expired);
 }
 snapshot(){return super.snapshot(this.now())}
 setBackground(value){if(value===this.background)return;this.observe(null,this.present);this.background=value;this.deadline=value?this.now()+this.limit:Infinity;}
 renew(){this.expired=false;this.deadline=this.background?this.now()+this.limit:Infinity;}
}
