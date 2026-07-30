(function () {
"use strict";

function getApi() {
return window.sfApi || null;
}

function isFunction(value) {
return typeof value === "function";
}

function getElement(id) {
return document.getElementById(id);
}

function getWorkerId(options) {
return options && options.context && options.context.workerId
? options.context.workerId
: "COMMANDER";
}

function getTaskId(options) {
return options && options.context && options.context.taskId
? options.context.taskId
: "S1-W02";
}

function setButtonBusy(button, busy, busyLabel) {
if (!button) {
return;
}

if (!button.getAttribute("data-original-label")) {
  button.setAttribute("data-original-label", button.textContent || "");
}

if (busy) {
  button.disabled = true;
  button.textContent = busyLabel || button.getAttribute("data-original-label");
  button.setAttribute("data-busy", "true");
} else {
  button.disabled = false;
  button.textContent = button.getAttribute("data-original-label") || button.textContent || "";
  button.removeAttribute("data-busy");
}

}

function emitRawState(options, state, shouldLog) {
if (options && isFunction(options.onStateChange)) {
options.onStateChange(state, shouldLog !== false);
}
}

function emitState(options, code, message, color) {
const state = {
workerId: getWorkerId(options),
taskId: getTaskId(options),
code: code,
color: color || "",
message: message || code,
updatedAt: new Date().toISOString()
};

emitRawState(options, state, true);
return state;

}

function appendLog(options, code, message, color) {
if (!options || !isFunction(options.appendLog)) {
return;
}

options.appendLog({
  workerId: getWorkerId(options),
  taskId: getTaskId(options),
  code: code || "READY",
  color: color || "",
  message: message || "",
  updatedAt: new Date().toISOString()
});

}

function extractTextFromResult(result, fieldNames) {
if (result == null) {
return "";
}

if (typeof result === "string") {
  return result;
}

if (Array.isArray(result)) {
  return result.map(function (item) {
    return extractTextFromResult(item, fieldNames);
  }).join("\n");
}

if (typeof result === "object") {
  for (let index = 0; index < fieldNames.length; index += 1) {
    const fieldName = fieldNames[index];
    if (typeof result[fieldName] === "string") {
      return result[fieldName];
    }
  }

  if (result.data && typeof result.data === "object") {
    const nestedText = extractTextFromResult(result.data, fieldNames);
    if (nestedText) {
      return nestedText;
    }
  }

  if (result.result && typeof result.result === "object") {
    const resultText = extractTextFromResult(result.result, fieldNames);
    if (resultText) {
      return resultText;
    }
  }
}

return "";

}

function extractPromptText(result) {
return extractTextFromResult(result, [
"prompt",
"promptText",
"fullPrompt",
"text",
"content",
"value"
]).trim();
}

function extractTaskText(result) {
return extractTextFromResult(result, [
"taskInstruction",
"instruction",
"content",
"text",
"body",
"value"
]).trim();
}

async function tryClipboardWrite(text) {
if (!text) {
return {
ok: false,
reason: "empty_text"
};
}

try {
  if (navigator.clipboard && isFunction(navigator.clipboard.writeText)) {
    await navigator.clipboard.writeText(text);
    return {
      ok: true
    };
  }
} catch (error) {
  return {
    ok: false,
    reason: error && error.message ? error.message : String(error)
  };
}

return {
  ok: false,
  reason: "clipboard_api_unavailable"
};

}

function stateFromResult(result, fallbackState, options) {
const fallback = fallbackState || {};
let source = {};

if (result && typeof result === "object") {
  if (result.state && typeof result.state === "object") {
    source = Object.assign({}, result, result.state);
  } else {
    source = Object.assign({}, result);
  }
}

return {
  workerId: source.workerId || source.worker_id || getWorkerId(options),
  taskId: source.taskId || source.task_id || getTaskId(options),
  code: source.code || source.statusCode || source.stateCode || source.status || fallback.code || "READY",
  color: source.color || source.statusColor || source.status_color || fallback.color || "",
  message: source.message || source.statusMessage || source.status_message || fallback.message || fallback.code || "READY",
  updatedAt: source.updatedAt || source.updated_at || new Date().toISOString()
};

}

function applyReturnedState(result, fallbackState, options) {
const state = stateFromResult(result, fallbackState, options);
emitRawState(options, state, true);
return state;
}

function refreshState(options) {
if (options && isFunction(options.requestStateRefresh)) {
return options.requestStateRefresh();
}
return Promise.resolve(null);
}

async function handleStart(options) {
const button = getElement("startButton");
setButtonBusy(button, true, "STARTING");

try {
  const api = getApi();
  const workerId = getWorkerId(options);

  if (!api) {
    throw new Error("window.sfApi is not available");
  }

  if (!isFunction(api.buildPrompt)) {
    throw new Error("window.sfApi.buildPrompt(workerId) is not available");
  }

  if (!isFunction(api.startWorker)) {
    throw new Error("window.sfApi.startWorker(workerId) is not available");
  }

  emitState(options, "PROMPT_BUILDING", "START 프롬프트 생성 요청 중", "ORANGE");

  const promptResult = await api.buildPrompt(workerId);
  const promptText = extractPromptText(promptResult);

  if (promptText && options && isFunction(options.setPromptText)) {
    options.setPromptText(promptText, promptResult);
  }

  if (promptText) {
    const clipboardResult = await tryClipboardWrite(promptText);
    if (clipboardResult.ok) {
      appendLog(options, "PROMPT_BUILDING", "START 프롬프트가 clipboard fallback에 복사되었습니다.", "ORANGE");
    } else {
      appendLog(options, "PROMPT_BUILDING", "clipboard 자동 복사 실패. 수동 fallback 영역을 사용하십시오.", "ORANGE");
    }
  } else {
    appendLog(options, "PROMPT_BUILDING", "buildPrompt 결과에 표시 가능한 프롬프트 텍스트가 없습니다.", "ORANGE");
  }

  emitState(options, "GPT_RUNNING", "START 실행 요청 중", "BLUE");

  const startResult = await api.startWorker(workerId);

  if (startResult && typeof startResult === "object" && startResult.ok === false) {
    emitState(options, "FAILED", startResult.message || "START 실행 요청 실패", "RED");
  } else {
    applyReturnedState(startResult, {
      code: "GPT_RUNNING",
      color: "BLUE",
      message: "START 실행 요청 완료"
    }, options);
  }
} catch (error) {
  emitState(options, "FAILED", "START 처리 실패: " + (error && error.message ? error.message : String(error)), "RED");
} finally {
  setButtonBusy(button, false);
  refreshState(options);
}

}

async function handleStop(options) {
const button = getElement("stopButton");
setButtonBusy(button, true, "STOPPING");

try {
  const api = getApi();
  const workerId = getWorkerId(options);

  if (!api || !isFunction(api.stopWorker)) {
    throw new Error("window.sfApi.stopWorker(workerId) is not available");
  }

  const stopResult = await api.stopWorker(workerId);

  if (stopResult && typeof stopResult === "object" && stopResult.ok === false) {
    emitState(options, "FAILED", stopResult.message || "STOP 요청 실패", "RED");
  } else {
    applyReturnedState(stopResult, {
      code: "STOPPED_BY_USER",
      color: "ORANGE",
      message: "STOP 요청 완료"
    }, options);
  }
} catch (error) {
  emitState(options, "FAILED", "STOP 처리 실패: " + (error && error.message ? error.message : String(error)), "RED");
} finally {
  setButtonBusy(button, false);
  refreshState(options);
}

}

async function handleSaveFullOutput(options) {
const button = getElement("saveFullOutputButton");
setButtonBusy(button, true, "SAVING");

try {
  const api = getApi();
  const workerId = getWorkerId(options);

  if (!api || !isFunction(api.saveFullOutput)) {
    throw new Error("window.sfApi.saveFullOutput(workerId) is not available");
  }

  emitState(options, "FULL_OUTPUT_SAVING", "GPT 전체 출력 저장 요청 중", "ORANGE");

  const saveResult = await api.saveFullOutput(workerId);

  if (saveResult && typeof saveResult === "object" && saveResult.ok === false) {
    emitState(options, "SAVE_FAILED", saveResult.message || "전체 출력 저장 실패", "RED");
  } else {
    applyReturnedState(saveResult, {
      code: "FULL_OUTPUT_SAVED",
      color: "BLUE",
      message: "GPT 전체 출력 저장 요청 완료"
    }, options);
  }
} catch (error) {
  emitState(options, "SAVE_FAILED", "SAVE FULL OUTPUT 처리 실패: " + (error && error.message ? error.message : String(error)), "RED");
} finally {
  setButtonBusy(button, false);
  refreshState(options);
}

}

async function handleReloadTask(options) {
const button = getElement("reloadTaskButton");
setButtonBusy(button, true, "RELOADING");

try {
  const api = getApi();
  const workerId = getWorkerId(options);

  if (!api || !isFunction(api.reloadTask)) {
    throw new Error("window.sfApi.reloadTask(workerId) is not available");
  }

  emitState(options, "CONSTITUTION_LOADING", "작업지시서 다시 불러오기 요청 중", "ORANGE");

  const reloadResult = await api.reloadTask(workerId);
  const taskText = extractTaskText(reloadResult);

  if (taskText && options && isFunction(options.setTaskInstruction)) {
    options.setTaskInstruction(taskText, reloadResult);
  } else if (options && isFunction(options.reloadTaskInstruction)) {
    await options.reloadTaskInstruction();
  }

  if (reloadResult && typeof reloadResult === "object" && reloadResult.taskId && options && options.context) {
    options.context.taskId = reloadResult.taskId;
  }

  applyReturnedState(reloadResult, {
    code: "TASK_LOADED",
    color: "BLUE",
    message: "작업지시서 다시 불러오기 완료"
  }, options);
} catch (error) {
  emitState(options, "TASK_MISSING", "RELOAD TASK 처리 실패: " + (error && error.message ? error.message : String(error)), "RED");
} finally {
  setButtonBusy(button, false);
  refreshState(options);
}

}

function wireClick(buttonId, handler, options) {
const button = getElement(buttonId);
if (!button) {
return;
}

button.addEventListener("click", function () {
  handler(options);
});

}

function setupButtonHandlers(options) {
const handlerOptions = options || {};

wireClick("startButton", handleStart, handlerOptions);
wireClick("stopButton", handleStop, handlerOptions);
wireClick("saveFullOutputButton", handleSaveFullOutput, handlerOptions);
wireClick("reloadTaskButton", handleReloadTask, handlerOptions);

return {
  start: function () {
    return handleStart(handlerOptions);
  },
  stop: function () {
    return handleStop(handlerOptions);
  },
  saveFullOutput: function () {
    return handleSaveFullOutput(handlerOptions);
  },
  reloadTask: function () {
    return handleReloadTask(handlerOptions);
  }
};

}

const apiObject = {
setupButtonHandlers: setupButtonHandlers,
handleStart: handleStart,
handleStop: handleStop,
handleSaveFullOutput: handleSaveFullOutput,
handleReloadTask: handleReloadTask
};

if (typeof window !== "undefined") {
window.SourceFactoryButtonHandlers = apiObject;
}

if (typeof module !== "undefined" && module.exports) {
module.exports = apiObject;
}
})();