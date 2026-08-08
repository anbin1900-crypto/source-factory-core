'use strict';
const SECRET_RE=/(bearer\s+[a-z0-9._~+/=-]{6,}|basic\s+[a-z0-9+/=]{8,}|(?:api[_-]?key|password|secret|token|cookie|authorization)\s*[:=]\s*(?!<redacted>)[^\s,;}]{6,})/i;
const EMAIL_RE=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE=/(?:\+?82[- .]?)?0(?:10|11|16|17|18|19)[- .]?\d{3,4}[- .]?\d{4}/;
const RRN_RE=/\b\d{6}[- ]?[1-4]\d{6}\b/;
const PII_KEY_RE=/^(?:email|email_address|phone|phone_number|mobile|mobile_number|rrn|ssn|resident_registration_number|owner_name|customer_name|agent_name|contact_name)$/i;
const RAW_SESSION_VALUE_KEYS=/^(?:cookie|authorization|proxy_authorization|csrf_token|xsrf_token|api_key|password)$/i;
function fail(code,path){const e=new Error(`${code} at ${path}`);e.code=code;throw e;}
function validate(value,path='$'){
  if(typeof value==='string'){
    if(['<REDACTED>','UNKNOWN','WAITING_INPUT'].includes(value)) return;
    if(SECRET_RE.test(value)) fail('RAW_SECRET_VALUE_REJECTED',path);
    if(EMAIL_RE.test(value)||PHONE_RE.test(value)||RRN_RE.test(value)) fail('RAW_PII_VALUE_REJECTED',path);
    return;
  }
  if(Array.isArray(value)){value.forEach((v,i)=>validate(v,`${path}[${i}]`));return;}
  if(value&&typeof value==='object') for(const [k,v] of Object.entries(value)){
    if(RAW_SESSION_VALUE_KEYS.test(k)&&typeof v==='string'&&!['<REDACTED>','UNKNOWN','WAITING_INPUT'].includes(v)) fail('RAW_SECRET_VALUE_REJECTED',`${path}.${k}`);
    if(PII_KEY_RE.test(k)&&typeof v==='string'&&!['<REDACTED>','UNKNOWN','WAITING_INPUT'].includes(v)&&v.length) fail('RAW_PII_VALUE_REJECTED',`${path}.${k}`);
    validate(v,`${path}.${k}`);
  }
}
function validateSessionReference(session){
  validate(session,'$.session');
  if(session?.credential_reference && typeof session.credential_reference!=='string') fail('INVALID_CREDENTIAL_REFERENCE','$.session.credential_reference');
  return {credential_reference_only:true,raw_secret_value_count:0,raw_pii_value_count:0};
}
function receipt(payload){validate(payload);const sessions=Array.isArray(payload?.sessions)?payload.sessions:[];sessions.forEach(validateSessionReference);return {schema_version:'A5_SECRET_PII_REDACTION_VALIDATION_RECEIPT_V1',status:'PASS',session_reference_count:sessions.length,credential_reference_only:true,raw_secret_value_count:0,raw_pii_value_count:0,redaction_required:true};}
module.exports={validate,validateSessionReference,receipt};
