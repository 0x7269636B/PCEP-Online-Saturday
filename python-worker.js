/* One fresh interpreter per run. Only the runtime is downloaded; source stays in the browser. */
'use strict';
const RUNTIME = 'https://cdn.jsdelivr.net/pyodide/v0.29.2/full/';
const MAX_OUTPUT = 65536;
let started = false;
self.onmessage = async ({data}) => {
  if (started || data?.type !== 'run') return;
  started = true;
  const send = (type, extra = {}) => self.postMessage({type, ...extra});
  let output = '', outputSize = 0, lastFlush = 0;
  const flush = () => {if (output) {send('output', {text:output}); output = ''; lastFlush = Date.now();}};
  const append = text => {
    const remaining = MAX_OUTPUT - outputSize;
    output += text.slice(0, Math.max(0, remaining));
    outputSize += text.length;
    if (outputSize >= MAX_OUTPUT) {flush(); send('limit'); throw new Error('Output limit reached');}
    if (output.length >= 2048 || Date.now() - lastFlush > 50) flush();
  };
  let py, globals;
  try {
    const {loadPyodide} = await import(RUNTIME + 'pyodide.mjs');
    py = await loadPyodide({indexURL:RUNTIME});
    const decoder = new TextDecoder();
    const write = bytes => {append(decoder.decode(bytes, {stream:true})); return bytes.length;};
    py.setStdout({write});
    py.setStderr({write});
    const inputText = String(data.stdin || '').replace(/\r\n?/g, '\n');
    const lines = inputText === '' ? [] : inputText.split('\n');
    let position = 0;
    py.setStdin({stdin:() => {
      if (position >= lines.length) {send('input-exhausted'); return undefined;}
      const line = lines[position++];
      append(line + '\n'); // Echo the supplied answer beside its input() prompt.
      flush();
      return line;
    }});
    globals = py.toPy({__name__:'__main__'});
    globals.set('__student_source__', String(data.code));
    send('running');
    // exec mode matches a .py file: a bare expression does not print its value.
    await py.runPythonAsync('exec(compile(__student_source__, "student.py", "exec"), globals())', {globals});
    append(decoder.decode());
    flush();
    send('done');
  } catch (error) {
    flush();
    send('error', {message:String(error.message || error).slice(0, 12000), loading:!py});
  } finally {
    globals?.destroy();
    self.close();
  }
};
