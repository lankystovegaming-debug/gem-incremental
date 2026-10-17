import {invokeFunction} from './invoke.js';

export async function christmasRequest(command={action:'snapshot'},requestId=null) {
  const {data,error}=await invokeFunction('christmas-2026',{
    ...command,...(requestId?{requestId}:{})
  },{retries:command.action==='snapshot'?2:0});
  if(error){const failure=new Error(error.message||error.code||'Christmas is temporarily unavailable.');failure.code=error.code;throw failure;}
  if(data?.error){const failure=new Error(data.error);failure.code=data.error;throw failure;}
  return data;
}
