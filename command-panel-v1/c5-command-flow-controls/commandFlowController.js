'use strict';
const constants=require('./lib/constants');
const admission=require('./lib/directiveAdmission');
const planner=require('./lib/actionPlanner');
function transition(currentState,event){const next=constants.TRANSITIONS[currentState]&&constants.TRANSITIONS[currentState][event];return next?{ok:true,currentState,event,nextState:next,finding:null}:{ok:false,currentState,event,nextState:null,finding:'INVALID_STATE_TRANSITION'}}
module.exports={SCHEMA_VERSION:'C5_COMMAND_FLOW_CONTROLLER_V1',...constants,...admission,...planner,transition};
