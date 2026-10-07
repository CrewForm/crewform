// SPDX-License-Identifier: AGPL-3.0-or-later
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const TTL=30*24*60*60*1000;
function secret() {const value=process.env.WIDGET_SESSION_SECRET??process.env.WEBHOOK_SECRET;if(!value) throw new Error('Widget session signing is not configured');return value;}
function sign(widget:string,payload:string) {return createHmac('sha256',secret()).update(`${widget}:${payload}`).digest('hex');}
export function issueVisitorToken(widget:string):string {const payload=`${Date.now()}.${randomBytes(32).toString('hex')}`;return `${payload}.${sign(widget,payload)}`;}
export function verifyVisitorToken(widget:string,value:unknown):value is string {
 if(typeof value!=='string' || !/^\d{13}\.[0-9a-f]{64}\.[0-9a-f]{64}$/.test(value)) return false;
 const [time,nonce,signature]=value.split('.');const age=Date.now()-Number(time);
 if(age<0 || age>TTL) return false;
 return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(widget,`${time}.${nonce}`),'hex'));
}
