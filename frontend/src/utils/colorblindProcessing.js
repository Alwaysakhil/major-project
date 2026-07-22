const LMS_FROM_LINEAR_RGB = [
  [0.1788240413, 0.4351609057, 0.0411934969],
  [0.0345564232, 0.2715538246, 0.0386713084],
  [0.0002995656, 0.0018430896, 0.0146708614],
];

const LINEAR_RGB_FROM_LMS = [
  [8.09444479, -13.05043146, 11.67205583],
  [-1.02485335, 5.40193266, -11.36147173],
  [-0.03652603, -0.41216561, 69.35132411],
];

const H_PROTAN_1 = [
  [0.0, 2.27376148, -5.92721645],
  [0.0, 1.0, 0.0],
  [0.0, 0.0, 1.0],
];

const H_PROTAN_2 = [
  [0.0, 2.18595384, -4.10029338],
  [0.0, 1.0, 0.0],
  [0.0, 0.0, 1.0],
];

const H_DEUTAN_1 = [
  [1.0, 0.0, 0.0],
  [0.43979987, 0.0, 2.60678902],
  [0.0, 0.0, 1.0],
];

const H_DEUTAN_2 = [
  [1.0, 0.0, 0.0],
  [0.4574662, 0.0, 1.87574564],
  [0.0, 0.0, 1.0],
];

const H_TRITAN_1 = [
  [1.0, 0.0, 0.0],
  [0.0, 1.0, 0.0],
  [-0.05574292, 0.15892917, 0.0],
];

const H_TRITAN_2 = [
  [1.0, 0.0, 0.0],
  [0.0, 1.0, 0.0],
  [-0.00254865, 0.0531321, 0.0],
];

const LMS_E = multiplyMat3Vec3(LMS_FROM_LINEAR_RGB, [1.0, 1.0, 1.0]);
const SEP_NORMAL = {
  protanopia: cross3(LMS_E, [1.0, 0.0, 0.0]),
  deuteranopia: cross3(LMS_E, [0.0, 1.0, 0.0]),
  tritanopia: cross3(LMS_E, [0.0, 0.0, 1.0]),
};

const CORRECTION_MATRICES = {
  protanopia: [
    [0.0, 0.0, 0.0],
    [0.7, 1.0, 0.0],
    [0.7, 0.0, 1.0],
  ],
  deuteranopia: [
    [1.0, 0.7, 0.0],
    [0.0, 0.0, 0.0],
    [0.0, 0.7, 1.0],
  ],
  tritanopia: [
    [1.0, 0.0, 0.7],
    [0.0, 1.0, 0.7],
    [0.0, 0.0, 0.0],
  ],
};

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function multiplyMat3Vec3(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * (value ** (1 / 2.4)) - 0.055;
}

function rgbToHsv255(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hueDegrees = 0;
  if (delta !== 0) {
    if (max === r) {
      hueDegrees = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hueDegrees = 60 * (((b - r) / delta) + 2);
    } else {
      hueDegrees = 60 * (((r - g) / delta) + 4);
    }
  }

  if (hueDegrees < 0) {
    hueDegrees += 360;
  }

  return {
    h: hueDegrees / 2,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsv255ToRgb(h, s, v) {
  const hueDegrees = (h % 180) * 2;
  const chroma = v * s;
  const huePrime = hueDegrees / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (huePrime >= 0 && huePrime < 1) {
    r1 = chroma;
    g1 = x;
  } else if (huePrime < 2) {
    r1 = x;
    g1 = chroma;
  } else if (huePrime < 3) {
    g1 = chroma;
    b1 = x;
  } else if (huePrime < 4) {
    g1 = x;
    b1 = chroma;
  } else if (huePrime < 5) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }

  const m = v - chroma;
  return [r1 + m, g1 + m, b1 + m];
}

function blurScalarMap(values, width, height, radius = 1) {
  const result = new Float32Array(values.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let ky = -radius; ky <= radius; ky += 1) {
        const ny = y + ky;
        if (ny < 0 || ny >= height) continue;

        for (let kx = -radius; kx <= radius; kx += 1) {
          const nx = x + kx;
          if (nx < 0 || nx >= width) continue;
          sum += values[ny * width + nx];
          count += 1;
        }
      }

      result[y * width + x] = count > 0 ? sum / count : values[y * width + x];
    }
  }

  return result;
}

function dilateBooleanMask(mask, width, height, radius = 1) {
  const result = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = 0;

      for (let ky = -radius; ky <= radius && !active; ky += 1) {
        const ny = y + ky;
        if (ny < 0 || ny >= height) continue;

        for (let kx = -radius; kx <= radius; kx += 1) {
          const nx = x + kx;
          if (nx < 0 || nx >= width) continue;
          if (mask[ny * width + nx]) {
            active = 1;
            break;
          }
        }
      }

      result[y * width + x] = active;
    }
  }

  return result;
}

function erodeBooleanMask(mask, width, height, radius = 1) {
  const result = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = 1;

      for (let ky = -radius; ky <= radius && active; ky += 1) {
        const ny = y + ky;
        if (ny < 0 || ny >= height) {
          active = 0;
          break;
        }

        for (let kx = -radius; kx <= radius; kx += 1) {
          const nx = x + kx;
          if (nx < 0 || nx >= width || !mask[ny * width + nx]) {
            active = 0;
            break;
          }
        }
      }

      result[y * width + x] = active;
    }
  }

  return result;
}

function closeBooleanMask(mask, width, height, radius = 1) {
  return erodeBooleanMask(dilateBooleanMask(mask, width, height, radius), width, height, radius);
}

function computeSimulationBase(r, g, b, colorblindType) {
  const rgbLinear = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const lms = multiplyMat3Vec3(LMS_FROM_LINEAR_RGB, rgbLinear);

  let h1;
  let h2;
  if (colorblindType === 'protanopia') {
    h1 = H_PROTAN_1;
    h2 = H_PROTAN_2;
  } else if (colorblindType === 'deuteranopia') {
    h1 = H_DEUTAN_1;
    h2 = H_DEUTAN_2;
  } else {
    h1 = H_TRITAN_1;
    h2 = H_TRITAN_2;
  }

  const sep = lms[0] * SEP_NORMAL[colorblindType][0] +
    lms[1] * SEP_NORMAL[colorblindType][1] +
    lms[2] * SEP_NORMAL[colorblindType][2];

  const simulatedLms = multiplyMat3Vec3(sep >= 0 ? h1 : h2, lms);
  const simulatedLinearRgb = multiplyMat3Vec3(LINEAR_RGB_FROM_LMS, simulatedLms);

  return [
    clamp01(linearToSrgb(clamp01(simulatedLinearRgb[0]))),
    clamp01(linearToSrgb(clamp01(simulatedLinearRgb[1]))),
    clamp01(linearToSrgb(clamp01(simulatedLinearRgb[2]))),
  ];
}

function applySimulationTweaks(rgbOut, originalRgb, colorblindType) {
  const hsv = rgbToHsv255(originalRgb[0], originalRgb[1], originalRgb[2]);
  let confidence = 0;
  let targetHue = 0;
  let minSaturation = 0;
  let strength = 0;

  if (colorblindType === 'protanopia') {
    const hueDist = Math.abs(hsv.h - 30);
    const hueScore = clamp01(1 - hueDist / 26);
    const satScore = clamp01((hsv.s - 0.10) / 0.45);
    const valScore = clamp01((hsv.v - 0.08) / 0.40);
    confidence = hueScore * satScore * valScore;
    targetHue = 6;
    minSaturation = 210 / 255;
    strength = 0.95;
  } else if (colorblindType === 'deuteranopia') {
    const hueDist = Math.abs(hsv.h - 30);
    const hueScore = clamp01(1 - hueDist / 28);
    const yellowDominance = clamp01((Math.min(originalRgb[0], originalRgb[1]) - originalRgb[2]) / 0.35);
    const satScore = clamp01((hsv.s - 0.08) / 0.45);
    const valScore = clamp01((hsv.v - 0.08) / 0.40);
    confidence = hueScore * Math.max(yellowDominance, 0.5 * satScore) * valScore;
    targetHue = 40;
    minSaturation = 185 / 255;
    strength = 0.9;
  } else {
    const hueDist = Math.abs(hsv.h - 60);
    const hueScore = clamp01(1 - hueDist / 32);
    const greenDominance = clamp01((originalRgb[1] - Math.max(originalRgb[0], originalRgb[2])) / 0.35);
    const satScore = clamp01((hsv.s - 0.10) / 0.50);
    const valScore = clamp01((hsv.v - 0.08) / 0.45);
    confidence = hueScore * Math.max(greenDominance, 0.5 * satScore) * valScore;
    targetHue = 112;
    minSaturation = 190 / 255;
    strength = 0.92;
  }

  if (confidence <= 0.03) {
    return rgbOut;
  }

  const outHsv = rgbToHsv255(rgbOut[0], rgbOut[1], rgbOut[2]);
  const blend = strength * confidence;
  const blendedHue = outHsv.h * (1 - blend) + targetHue * blend;
  const blendedSaturation = outHsv.s * (1 - blend) + Math.max(outHsv.s, minSaturation) * blend;
  return hsv255ToRgb(blendedHue, clamp01(blendedSaturation), outHsv.v);
}

function applyEnhancementTweaks(rgbOut, originalRgb, colorblindType) {
  const hsv = rgbToHsv255(originalRgb[0], originalRgb[1], originalRgb[2]);

  if (colorblindType === 'protanopia') {
    const redHueDist = Math.min(hsv.h, 180 - hsv.h) / 30;
    const redHueScore = clamp01(1 - redHueDist);
    const satScore = clamp01((hsv.s - 0.22) / 0.45);
    const valScore = clamp01((hsv.v - 0.15) / 0.35);
    const redConfidence = redHueScore * satScore * valScore;

    if (redConfidence > 0.05) {
      const blend = Math.min(1, 0.95 * redConfidence);
      return [
        clamp01(rgbOut[0] * (1 - blend) + 1.0 * blend),
        clamp01(rgbOut[1] * (1 - blend) + 0.05 * blend),
        clamp01(rgbOut[2] * (1 - blend)),
      ];
    }
  } else if (colorblindType === 'deuteranopia') {
    const greenHueDist = Math.abs(hsv.h - 60);
    const greenHueScore = clamp01(1 - greenHueDist / 42);
    const greenDominance = clamp01((originalRgb[1] - Math.max(originalRgb[0], originalRgb[2])) / 0.28);
    const satScore = clamp01((hsv.s - 0.05) / 0.50);
    const valScore = clamp01((hsv.v - 0.05) / 0.45);
    const greenConfidence = greenHueScore * Math.max(greenDominance, 0.45 * satScore) * valScore;

    const strongGreenMask = ((hsv.h >= 32 && hsv.h <= 110) && hsv.s > 0.05 && hsv.v > 0.05) || greenConfidence > 0.10;
    if (greenConfidence > 0.02 || strongGreenMask) {
      const outHsv = rgbToHsv255(rgbOut[0], rgbOut[1], rgbOut[2]);
      const blend = strongGreenMask ? 1 : Math.min(1, 1.05 * greenConfidence);
      return hsv255ToRgb(
        outHsv.h * (1 - blend) + 28 * blend,
        clamp01(outHsv.s * (1 - blend) + Math.max(outHsv.s, 200 / 255) * blend),
        outHsv.v
      );
    }
  } else {
    const blueHueDist = Math.min(Math.abs(hsv.h - 120), Math.abs(hsv.h - 0) + 60);
    const blueHueScore = clamp01(1 - blueHueDist / 34);
    const blueDominance = clamp01((originalRgb[2] - Math.max(originalRgb[0], originalRgb[1])) / 0.35);
    const satScore = clamp01((hsv.s - 0.08) / 0.50);
    const valScore = clamp01((hsv.v - 0.06) / 0.45);
    const blueConfidence = blueHueScore * Math.max(blueDominance, 0.5 * satScore) * valScore;

    if (blueConfidence > 0.02) {
      const blend = 0.88 * blueConfidence;
      return [
        clamp01(rgbOut[0] * (1 - blend) + 0.06 * blend),
        clamp01(rgbOut[1] * (1 - blend) + 0.88 * blend),
        clamp01(rgbOut[2] * (1 - blend) + 0.12 * blend),
      ];
    }
  }

  return rgbOut;
}

function simulatePixel(originalRgb, colorblindType) {
  return applySimulationTweaks(
    computeSimulationBase(originalRgb[0], originalRgb[1], originalRgb[2], colorblindType),
    originalRgb,
    colorblindType
  );
}

function enhancePixel(originalRgb, colorblindType) {
  const simRgb = simulatePixel(originalRgb, colorblindType);
  const correction = CORRECTION_MATRICES[colorblindType];
  const error = [
    originalRgb[0] - simRgb[0],
    originalRgb[1] - simRgb[1],
    originalRgb[2] - simRgb[2],
  ];

  let corrected = [
    clamp01(originalRgb[0] + correction[0][0] * error[0] + correction[0][1] * error[1] + correction[0][2] * error[2]),
    clamp01(originalRgb[1] + correction[1][0] * error[0] + correction[1][1] * error[1] + correction[1][2] * error[2]),
    clamp01(originalRgb[2] + correction[2][0] * error[0] + correction[2][1] * error[1] + correction[2][2] * error[2]),
  ];

  if (colorblindType === 'deuteranopia') {
    corrected = corrected.map((channel, index) => clamp01(originalRgb[index] + (channel - originalRgb[index]) * 1.35));
  }

  return applyEnhancementTweaks(corrected, originalRgb, colorblindType);
}

function processDeuteranopiaEnhanceImageData(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const corrected = new Float32Array(pixelCount * 3);
  const saturations = new Float32Array(pixelCount);
  const values = new Float32Array(pixelCount);
  const greenConfidence = new Float32Array(pixelCount);
  const strongGreenMask = new Uint8Array(pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const i = pixelIndex * 4;
    const originalRgb = [
      data[i] / 255,
      data[i + 1] / 255,
      data[i + 2] / 255,
    ];

    const hsv = rgbToHsv255(originalRgb[0], originalRgb[1], originalRgb[2]);
    saturations[pixelIndex] = hsv.s;
    values[pixelIndex] = hsv.v;

    const simRgb = simulatePixel(originalRgb, 'deuteranopia');
    const error = [
      originalRgb[0] - simRgb[0],
      originalRgb[1] - simRgb[1],
      originalRgb[2] - simRgb[2],
    ];

    let correctedRgb = [
      clamp01(originalRgb[0] + (error[0] + 0.7 * error[1]) * 1.35),
      originalRgb[1],
      clamp01(originalRgb[2] + (0.7 * error[1] + error[2]) * 1.35),
    ];

    corrected[pixelIndex * 3] = correctedRgb[0];
    corrected[pixelIndex * 3 + 1] = correctedRgb[1];
    corrected[pixelIndex * 3 + 2] = correctedRgb[2];

    const greenHueDist = Math.abs(hsv.h - 60);
    const greenHueScore = clamp01(1 - greenHueDist / 42);
    const greenDominance = clamp01((originalRgb[1] - Math.max(originalRgb[0], originalRgb[2])) / 0.28);
    const satScore = clamp01((hsv.s - 0.05) / 0.50);
    const valScore = clamp01((hsv.v - 0.05) / 0.45);
    const confidence = greenHueScore * Math.max(greenDominance, 0.45 * satScore) * valScore;
    greenConfidence[pixelIndex] = confidence;

    const likelyGreenFamily =
      hsv.h >= 42 &&
      hsv.h <= 100 &&
      hsv.s > 0.18 &&
      hsv.v > 0.08 &&
      greenDominance > 0.06;

    if (likelyGreenFamily || confidence > 0.22) {
      strongGreenMask[pixelIndex] = 1;
    }
  }

  const smoothedConfidence = blurScalarMap(greenConfidence, width, height, 1);
  const closedMask = closeBooleanMask(strongGreenMask, width, height, 1);
  const expandedMask = dilateBooleanMask(closedMask, width, height, 1);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const hsv = rgbToHsv255(
      corrected[pixelIndex * 3],
      corrected[pixelIndex * 3 + 1],
      corrected[pixelIndex * 3 + 2]
    );

    const smoothed = clamp01(smoothedConfidence[pixelIndex]);
    if (smoothed > 0.02) {
      const blend = Math.min(0.82, 0.95 * smoothed);
      const correctedHsvRgb = hsv255ToRgb(
        hsv.h * (1 - blend) + 28 * blend,
        clamp01(hsv.s * (1 - blend) + Math.max(hsv.s, 185 / 255) * blend),
        hsv.v
      );
      corrected[pixelIndex * 3] = correctedHsvRgb[0];
      corrected[pixelIndex * 3 + 1] = correctedHsvRgb[1];
      corrected[pixelIndex * 3 + 2] = correctedHsvRgb[2];
    }

    if (expandedMask[pixelIndex] && smoothed > 0.12) {
      const forcedRgb = hsv255ToRgb(
        28,
        Math.max(170 / 255, Math.min(0.88, saturations[pixelIndex])),
        values[pixelIndex]
      );
      corrected[pixelIndex * 3] = forcedRgb[0];
      corrected[pixelIndex * 3 + 1] = forcedRgb[1];
      corrected[pixelIndex * 3 + 2] = forcedRgb[2];
    }
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const i = pixelIndex * 4;
    data[i] = Math.round(clamp01(corrected[pixelIndex * 3]) * 255);
    data[i + 1] = Math.round(clamp01(corrected[pixelIndex * 3 + 1]) * 255);
    data[i + 2] = Math.round(clamp01(corrected[pixelIndex * 3 + 2]) * 255);
  }

  return imageData;
}

function processProtanopiaEnhanceImageData(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const i = pixelIndex * 4;
    const originalRgb = [
      data[i] / 255,
      data[i + 1] / 255,
      data[i + 2] / 255,
    ];

    const hsv = rgbToHsv255(originalRgb[0], originalRgb[1], originalRgb[2]);
    
    // Detect red tones that protanopes confuse with green
    const redHueDist = Math.min(hsv.h, 180 - hsv.h);
    const isRedFamily = redHueDist < 28;
    
    if (isRedFamily && hsv.s > 0.15 && hsv.v > 0.12) {
      const simRgb = simulatePixel(originalRgb, 'protanopia');
      const error = [
        originalRgb[0] - simRgb[0],
        originalRgb[1] - simRgb[1],
        originalRgb[2] - simRgb[2],
      ];

      // Shift towards orange/yellow which protanopes can better distinguish
      let correctedRgb = [
        clamp01(originalRgb[0] + (error[0] + 0.3 * error[1]) * 1.15),
        clamp01(originalRgb[1] + (0.5 * error[0] + 0.5 * error[1]) * 1.15),
        clamp01(originalRgb[2] + error[2] * 0.9),
      ];

      const correctedHsv = rgbToHsv255(correctedRgb[0], correctedRgb[1], correctedRgb[2]);
      
      // Blend towards orange (hue ~25) with moderate saturation
      const confidence = Math.min(1, (hsv.s - 0.15) * 2);
      const blend = 0.6 * confidence;
      
      const finalRgb = hsv255ToRgb(
        correctedHsv.h * (1 - blend) + 25 * blend,
        clamp01(correctedHsv.s * (1 - blend) + Math.max(correctedHsv.s, 0.7) * blend),
        correctedHsv.v
      );

      data[i] = Math.round(clamp01(finalRgb[0]) * 255);
      data[i + 1] = Math.round(clamp01(finalRgb[1]) * 255);
      data[i + 2] = Math.round(clamp01(finalRgb[2]) * 255);
    }
  }

  return imageData;
}

export function processColorblindImageData(imageData, colorblindType, mode) {
  if (mode === 'enhance' && colorblindType === 'deuteranopia') {
    return processDeuteranopiaEnhanceImageData(imageData);
  }

  if (mode === 'enhance' && colorblindType === 'protanopia') {
    return processProtanopiaEnhanceImageData(imageData);
  }

  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const originalRgb = [
      data[i] / 255,
      data[i + 1] / 255,
      data[i + 2] / 255,
    ];

    const processedRgb = mode === 'simulate'
      ? simulatePixel(originalRgb, colorblindType)
      : enhancePixel(originalRgb, colorblindType);

    data[i] = Math.round(clamp01(processedRgb[0]) * 255);
    data[i + 1] = Math.round(clamp01(processedRgb[1]) * 255);
    data[i + 2] = Math.round(clamp01(processedRgb[2]) * 255);
  }

  return imageData;
}
