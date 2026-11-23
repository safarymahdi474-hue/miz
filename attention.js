// Every transition invalidates an inference started before leaving the page,
// even when focus returns before that inference finishes.
export class AttentionGate {
  constructor(){this.focused=true;this.hidden=false;this.suspended=false;this.epoch=0}
  get allowed(){return this.focused&&!this.hidden&&!this.suspended}
  update(next){
    const changed=['focused','hidden','suspended'].some(k=>k in next&&this[k]!==next[k]);
    Object.assign(this,next);if(changed)this.epoch++;return changed;
  }
  accepts(epoch){return this.allowed&&epoch===this.epoch}
}
