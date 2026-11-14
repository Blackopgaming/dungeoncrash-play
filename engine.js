/* DUNGEONCRASH ENGINE — pure logic, zero rendering.
   Themes read DC.state each frame and subscribe to DC.on(event). Same math for every skin. */
(function(global){
  "use strict";
  const RTP=0.96;
  const ORDER=["R","E","B"];                       // one of each: GRUB, WRAITH, BOSS
  const ENEMY={ R:{name:"Grub",hp:2,dmg:2,prec:0.70,col:"#7fae58"},
                E:{name:"Wraith",hp:3,dmg:3,prec:0.66,col:"#8fa0c0"},
                B:{name:"Boss",hp:7,dmg:6,prec:0.60,col:"#c23644"} };
  const HERO0={hp:10,maxhp:10,dmg:1,prec:0.82};
  const RIP_BASE=0.050,RIP_RAMP=0.030,DODGE=0.25,DEFLECT=0.20,MAXX=60,HEAL_AMT=5,POT_MAX=5;
  const ITEMS={ weapon:{icon:"🪓",name:"War Axe"},shield:{icon:"🛡️",name:"Tower Shield"},armour:{icon:"🥋",name:"Deflection Plate"},
    ring:{icon:"💍",name:"Ring of Power"},amulet:{icon:"📿",name:"Amulet of Dodging"},potion:{icon:"⚗️",name:"Potion"} };
  const ITEM_RARITY={weapon:"uncommon",shield:"rare",armour:"epic",ring:"rare",amulet:"epic",potion:"rare"};
  const RARITY={ common:{lab:"COMMON",col:"#6a6458",wow:0},uncommon:{lab:"UNCOMMON",col:"#5f8046",wow:1},
    rare:{lab:"RARE",col:"#5a7a9a",wow:1},epic:{lab:"EPIC",col:"#7a5ab0",wow:2},legendary:{lab:"LEGENDARY",col:"#c8a030",wow:3} };
  function lootOf(c){ if(c.kind==="artefact")return{icon:"💎",name:"The Artefact",rar:"legendary",item:"artefact"};
    if(c.kind==="upgrade")return{icon:ITEMS[c.item].icon,name:ITEMS[c.item].name,rar:ITEM_RARITY[c.item]||"rare",item:c.item};
    if(c.kind==="heal")return{icon:ITEMS.potion.icon,name:ITEMS.potion.name,rar:"rare",item:"potion"};
    return{icon:"🕸️",name:"Empty",rar:"common",item:"empty"}; }

  // ---- DROP MODEL (per chest, depends on what's already looted) ----
  // artefact: extremely rare. weapon->shield->armour: common but each rarer (all 3 ~ artefact-rare).
  // potions: like gear, each one rarer, 5 total. ring/amulet: rare, -50% once one looted.
  function chestOdds(g){
    const o={artefact:0.007};
    if(!g.weapon) o.weapon=0.34; else if(!g.shield) o.shield=0.17; else if(!g.armour) o.armour=0.075;
    const PT=[0.30,0.19,0.11,0.06,0.03]; if(g.potions<POT_MAX) o.potion=PT[g.potions];
    const oneRA=g.ring||g.amulet;
    if(!g.ring) o.ring=oneRA?0.045:0.09;
    if(!g.amulet) o.amulet=oneRA?0.045:0.09;
    let sum=0; for(const k in o) sum+=o[k]; o.empty=Math.max(0,1-sum);
    return o;
  }
  function chestRoll(rng,g){
    const o=chestOdds(g); let r=rng();
    const seq=[["artefact","artefact",o.artefact]];
    if(o.weapon)seq.push(["upgrade","weapon",o.weapon]);
    if(o.shield)seq.push(["upgrade","shield",o.shield]);
    if(o.armour)seq.push(["upgrade","armour",o.armour]);
    if(o.potion)seq.push(["heal","potion",o.potion]);
    if(o.ring)seq.push(["upgrade","ring",o.ring]);
    if(o.amulet)seq.push(["upgrade","amulet",o.amulet]);
    for(const [kind,item,p] of seq){ if(r<p) return {kind,item}; r-=p; }
    return {kind:"empty",item:null};
  }
  function chestProbs(g){ const o=chestOdds(g);
    return {artefact:o.artefact, upgrade:(o.weapon||0)+(o.shield||0)+(o.armour||0)+(o.ring||0)+(o.amulet||0), heal:o.potion||0, empty:o.empty}; }

  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function cyrb(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return(h^h>>>16)>>>0;}
  function heroDmg(g){let d=HERO0.dmg;if(g.weapon)d*=2;if(g.ring)d+=1;return d;}
  function fight(rng,hp,g,type){const e=ENEMY[type];let ehp=e.hp;const hd=heroDmg(g);let sw=0;const log=[];
    while(true){ if(rng()<HERO0.prec){ehp-=hd;log.push({who:"hero",dmg:hd,ehp,hp});if(ehp<=0)return{win:true,hp,log};} sw++;
      if(rng()<e.prec){ if(!(g.amulet&&rng()<DODGE)){ let dmg=e.dmg;if(g.shield)dmg=Math.max(1,Math.floor(dmg/2)); hp-=dmg; let refl=false;
        if(g.armour&&rng()<DEFLECT){ehp-=e.dmg;refl=true;} log.push({who:"enemy",dmg,ehp,hp,refl});
        if(refl&&ehp<=0)return{win:true,hp,log}; if(hp<=0)return{win:false,hp:0,log}; } }
      if(sw>80)return{win:true,hp,log}; } }
  function newGear(){return{weapon:false,shield:false,armour:false,ring:false,amulet:false,potions:0};}
  function simulate(rng){const g=newGear();let hp=HERO0.hp;const beats=[];let cleared=0,outcome=null,artDepth=0;
    for(let d=0;d<ORDER.length;d++){ const chest=chestRoll(rng,g);
      if(chest.kind==="artefact"){outcome="artefact";artDepth=d+1;beats.push({depth:d+1,chest,gear:{...g},hp});break;}
      if(chest.kind==="upgrade")g[chest.item]=true; else if(chest.kind==="heal"){g.potions++;hp=Math.min(HERO0.maxhp,hp+HEAL_AMT);}
      const type=ORDER[d];const res=fight(rng,hp,g,type);const beat={depth:d+1,type,chest,win:res.win,hpBefore:hp,hpAfter:res.hp,gear:{...g},log:res.log};hp=res.hp;
      if(!res.win){outcome="combat";beats.push(beat);break;} cleared++;
      const pc=Math.max(0,RIP_BASE+RIP_RAMP*d); if(rng()<pc){outcome="ripper";beat.ripper=true;beats.push(beat);break;} beats.push(beat); }
    if(!outcome)outcome="escape"; return{beats,cleared,outcome,gotArtefact:outcome==="artefact",artDepth}; }

  let LADDER=[],P_REACH=[],PART=0;
  function calibrate(N){const reach=new Array(ORDER.length+1).fill(0);let art=0;const rng=mulberry32(0x1a2b3c4d);
    for(let i=0;i<N;i++){const s=simulate(rng);for(let d=1;d<=s.cleared;d++)reach[d]++;if(s.gotArtefact)art++;}
    P_REACH=reach.map(x=>x/N);PART=art/N;LADDER=[1];for(let d=1;d<=ORDER.length;d++){const p=Math.max(P_REACH[d],1e-6);LADDER[d]=Math.min(MAXX,Math.max(1,RTP/p));}
    E.LADDER=LADDER;E.P_REACH=P_REACH;E.PART=PART; }
  function measureRTP(N,mode,K){let st=0,ret=0;const rng=mulberry32(0x7f3d9e21);
    for(let i=0;i<N;i++){const s=simulate(rng);st++; if(mode==="hold"){if(s.gotArtefact)ret+=LADDER[s.cleared]||1;else if(s.outcome==="escape")ret+=LADDER[ORDER.length];} else {if(s.cleared>=K)ret+=LADDER[K];}} return ret/st; }

  const fmtx=n=>n.toFixed(2)+"×";
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let actx=null;
  function beep(f,d,t="square",v=.05){try{actx=actx||new(AudioContext||webkitAudioContext)();const o=actx.createOscillator(),g=actx.createGain();o.type=t;o.frequency.value=f;o.connect(g);g.connect(actx.destination);g.gain.setValueAtTime(v,actx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+d);o.start();o.stop(actx.currentTime+d);}catch(e){}}

  const LS="dc_bal4";
  const E={
    RTP,ORDER,ENEMY,ITEMS,RARITY,HEAL:HEAL_AMT,maxHp:HERO0.maxhp,fmtx,beep,LADDER,P_REACH,PART,
    balance:(()=>{try{const v=JSON.parse(localStorage.getItem(LS));return(typeof v==="number"&&v>=0)?v:5000;}catch(e){return 5000;}})(),
    state:{phase:"idle",runNo:1,depth:0,mult:1,cashed:false,cashMult:0,bet:0,gear:newGear(),hp:HERO0.maxhp,
      enemy:null,enemyName:"",enemyHp:0,enemyMaxHp:1,enemyHpFrac:1,chestOpen:false,ripper:0,chestCountdown:0,chestOptions:[],stateText:"",chestBetAmt:0},
    _on:{}, on(ev,fn){(this._on[ev]=this._on[ev]||[]).push(fn);}, _emit(ev,d){(this._on[ev]||[]).forEach(f=>f(d));},
    _save(){try{localStorage.setItem(LS,JSON.stringify(this.balance));}catch(e){} this._emit("balance",this.balance);},
    calibrate,measureRTP,chestProbs,lootOf,
    _run:null,_chestPick:null,
    reset(){const s=this.state;s.phase="idle";s.cashed=false;s.cashMult=0;s.depth=0;s.mult=1;s.enemy=null;s.ripper=0;
      s.gear=newGear();s.hp=HERO0.maxhp;s.stateText="PLACE YOUR STAKE";
      this._run=simulate(mulberry32(cyrb("dc4-"+s.runNo)));this._chestPick=null;
      s.chestOptions=this._optsFor(s.gear);this._emit("idle");},
    _optsFor(gear){const p=chestProbs(gear);return[["artefact","ARTEFACT",p.artefact],["upgrade","UPGRADE",p.upgrade],["heal","POTION",p.heal],["empty","EMPTY",p.empty]]
      .map(([k,lab,pr])=>({k,lab,prob:pr,odds:pr>0?RTP/pr:0}));},
    pickChest(k){this._chestPick=k;},
    start(stake){const s=this.state;if(s.phase!=="idle")return;stake=Math.floor(stake);if(stake<1||stake>this.balance)return;
      s.bet=stake;this.balance-=stake;this._save();s.phase="bet";s.cashed=false;s.mult=1;beep(300,.08,"sawtooth");this._play();},
    cashOut(){const s=this.state;if(s.cashed||(s.phase!=="fight"&&s.phase!=="bet"&&s.phase!=="open"))return;
      s.cashed=true;s.cashMult=s.mult;const win=s.bet*s.cashMult;this.balance+=win;this._save();
      beep(880,.1);setTimeout(()=>beep(1180,.1),70);this._emit("cash",{mult:s.cashMult,win});},
    async _play(){
      const self=this,run=this._run,s=this.state,g=newGear();let clearedMult=1;
      for(const b of run.beats){ s.depth=b.depth;
        s.phase="travel";s.enemy=null;s.chestOpen=false;s.stateText="DESCENDING…";self._emit("travel",{depth:b.depth});await sleep(900);
        s.phase="bet";s.enemy=null;s.gear={...g};s.chestOptions=this._optsFor(g);this._chestPick=null;
        const cb=Math.max(1,Math.round(s.bet*0.25));s.chestBetAmt=cb;
        this._emit("chestwindow",{depth:b.depth,options:s.chestOptions,chestBet:cb});
        self._emit("betsopen",{depth:b.depth});
        for(let t=26;t>=0;t--){ s.chestCountdown=t/10; s.stateText="CHEST BETS OPEN · "+(t/10).toFixed(1)+"s"; s.mult=clearedMult; await sleep(100); }
        self._emit("betsclosed",{picked:!!this._chestPick});s.chestCountdown=0;s.stateText="CHEST BETS CLOSED";
        let cbStake=0; if(this._chestPick&&this.balance>=cb){cbStake=cb;this.balance-=cb;this._save();}
        await sleep(650);
        s.phase="open";s.stateText="OPENING CHEST";beep(560,.06);self._emit("open");await sleep(620);
        if(b.chest.kind==="upgrade"){g[b.chest.item]=true;s.gear={...g};} else if(b.chest.kind==="heal"){g.potions++;s.gear={...g};s.hp=Math.min(HERO0.maxhp,s.hp+HEAL_AMT);}
        const loot=lootOf(b.chest),R=RARITY[loot.rar];
        s.stateText=R.lab+" · "+loot.name;
        this._emit("reveal",{icon:loot.icon,name:loot.name,rar:loot.rar,label:R.lab,color:R.col,wow:R.wow,depth:b.depth,kind:b.chest.kind,item:b.chest.item});
        let betRes=null;
        if(cbStake){ const opt=s.chestOptions.find(o=>o.k===this._chestPick); const won=this._chestPick===b.chest.kind;
          if(won){const pay=Math.round(cbStake*(opt?opt.odds:1.5));this.balance+=pay;this._save();betRes={won:true,amount:pay};setTimeout(()=>beep(1040,.1),120);} else betRes={won:false,amount:cbStake}; }
        this._emit("loot",{icon:loot.icon,name:loot.name,rar:loot.rar,label:R.lab,color:R.col,depth:b.depth,bet:betRes,kind:b.chest.kind,item:b.chest.item});
        await sleep(R.wow>=3?2500:R.wow>=2?1500:1000);
        if(b.chest.kind==="artefact")return this._end("artefact",clearedMult);
        s.phase="fight";s.enemy=b.type;s.enemyName=ENEMY[b.type].name;s.enemyMaxHp=ENEMY[b.type].hp;s.enemyHp=ENEMY[b.type].hp;s.enemyHpFrac=1;s.stateText="IN COMBAT · "+ENEMY[b.type].name;
        self._emit("fight",{type:b.type,name:ENEMY[b.type].name,depth:b.depth,win:b.win});
        const log=b.log||[],target=LADDER[b.depth],from=clearedMult,dur=1600+(b.type==="B"?1300:b.type==="E"?500:0),t0=performance.now();let li=0;
        await new Promise(res=>{(function fr(){const p=Math.min(1,(performance.now()-t0)/dur);
          if(!s.cashed)s.mult=from+(target-from)*p;
          const want=Math.floor(p*log.length);
          while(li<want){const e=log[li++];s.enemyHp=Math.max(0,e.ehp);if(e.who==="enemy")s.hp=Math.max(0,e.hp);s.enemyHpFrac=s.enemyHp/s.enemyMaxHp;self._emit("hit",{who:e.who,dmg:e.dmg,refl:e.refl});}
          if(p<1)requestAnimationFrame(fr);else res();})();});
        s.hp=b.hpAfter;s.enemyHp=b.win?0:s.enemyHp;s.enemyHpFrac=s.enemyHp/s.enemyMaxHp;
        if(!b.win)return this._end(b.ripper?"ripper":"combat",clearedMult);
        clearedMult=LADDER[b.depth];if(!s.cashed)s.mult=clearedMult;s.ripper=Math.min(0.95,b.depth/ORDER.length*0.8);
        this._emit("survive",{depth:b.depth,mult:clearedMult});beep(700+b.depth*40,.06);await sleep(850);
        if(b.ripper)return this._end("ripper",clearedMult);
      }
      return this._end("escape",clearedMult);
    },
    _end(outcome,curMult){const s=this.state;s.phase="end";s.enemy=null;
      let win=0; if(outcome==="artefact"||outcome==="escape"){win=s.cashed?0:s.bet*curMult;if(!s.cashed){this.balance+=win;this._save();}s.mult=curMult;
        if(outcome==="artefact")beep(600,.1),setTimeout(()=>beep(950,.1),90),setTimeout(()=>beep(1400,.18),180); else beep(700,.1),setTimeout(()=>beep(1050,.12),90);
      } else { beep(150,.3,"sawtooth"); }
      this._emit("end",{outcome,win,cashed:s.cashed,cashMult:s.cashMult,mult:curMult,depth:s.depth});
      setTimeout(()=>{s.runNo++;this.reset();},2800); },
    boot(N){ this.calibrate(N||400000); this.reset(); this.ready=true; this._emit("ready"); }
  };
  global.DC=E;
})(window);
