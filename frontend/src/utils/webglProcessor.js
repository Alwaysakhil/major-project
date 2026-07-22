export function initWebGL(canvas) {
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  
  if (!gl) {
    console.warn('WebGL not supported, falling back to canvas 2D');
    return null;
  }

  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform int u_colorblindType;
    uniform int u_mode;
    varying vec2 v_texCoord;
    
    void main() {
      vec4 color = texture2D(u_image, v_texCoord);
      
      if (u_mode == 0) {
        if (u_colorblindType == 0) {
          gl_FragColor = vec4(
            color.r * 0.567 + color.g * 0.433,
            color.r * 0.558 + color.g * 0.442,
            color.g * 0.242 + color.b * 0.758,
            color.a
          );
        } else if (u_colorblindType == 1) {
          gl_FragColor = vec4(
            color.r * 0.625 + color.g * 0.375,
            color.r * 0.700 + color.g * 0.300,
            color.g * 0.300 + color.b * 0.700,
            color.a
          );
        } else {
          gl_FragColor = vec4(
            color.r * 0.950 + color.g * 0.050,
            color.g * 0.433 + color.b * 0.567,
            color.g * 0.475 + color.b * 0.525,
            color.a
          );
        }
      } else {
        float avg = (color.r + color.g + color.b) / 3.0;
        float factor = 1.3;
        gl_FragColor = vec4(
          min(1.0, avg + (color.r - avg) * factor),
          min(1.0, avg + (color.g - avg) * factor),
          min(1.0, avg + (color.b - avg) * factor),
          color.a
        );
      }
    }
  `;

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  
  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) {
    return null;
  }

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ]), gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 1,
    1, 1,
    0, 0,
    0, 0,
    1, 1,
    1, 0,
  ]), gl.STATIC_DRAW);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {
    gl,
    program,
    positionBuffer,
    texCoordBuffer,
    texture,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    texCoordLocation: gl.getAttribLocation(program, 'a_texCoord'),
    imageLocation: gl.getUniformLocation(program, 'u_image'),
    colorblindTypeLocation: gl.getUniformLocation(program, 'u_colorblindType'),
    modeLocation: gl.getUniformLocation(program, 'u_mode'),
  };
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  
  return program;
}

export function processFrameWebGL(webglState, video, canvas, colorblindType, mode) {
  if (!webglState || !video || !canvas) return;

  const { gl, program, positionBuffer, texCoordBuffer, texture } = webglState;
  const { positionLocation, texCoordLocation, imageLocation, colorblindTypeLocation, modeLocation } = webglState;

  canvas.width = video.videoWidth || 800;
  canvas.height = video.videoHeight || 600;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

  gl.uniform1i(imageLocation, 0);
  
  const colorblindTypeMap = { protanopia: 0, deuteranopia: 1, tritanopia: 2 };
  gl.uniform1i(colorblindTypeLocation, colorblindTypeMap[colorblindType] || 0);
  
  const modeMap = { simulate: 0, enhance: 1 };
  gl.uniform1i(modeLocation, modeMap[mode] || 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
