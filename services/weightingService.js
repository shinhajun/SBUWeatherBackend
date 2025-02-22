// 초기 가중치 (각 제공자의 기본 가중치)
let providerWeights = {
  providerNWS: { temp: 0.33, rain: 0.33, snow: 0.33 },
  providerOWM: { temp: 0.33, rain: 0.33, snow: 0.33 },
  providerWB:  { temp: 0.34, rain: 0.34, snow: 0.34 }
};

// 정확도 기록 배열
let accuracyHistory = [];

// 가중치 히스토리 기록 배열
let weightHistory = [];

/**
 * 일일 최종 예보 계산:
 * 각 제공자의 예보에 해당 가중치를 곱해 합산.
 */
function calculateFinalForecast(forecasts) {
  let tempSum = 0, rainSum = 0, snowSum = 0;
  for (const provider in forecasts) {
    const f = forecasts[provider];
    if (!f) continue;
    const w = providerWeights[provider] || { temp: 0, rain: 0, snow: 0 };
    tempSum += f.temperature * w.temp;
    rainSum += f.rainProbability * w.rain;
    snowSum += f.snowProbability * w.snow;
  }
  return {
    temperature: tempSum,
    rainProbability: rainSum,
    snowProbability: snowSum
  };
}

/**
 * 주간 예보 계산:
 * 7일치 데이터를 날짜별로 가중치 적용하여 계산.
 * 배열 길이가 부족하면 기본값(0)을 사용.
 */
function calculateFinalWeeklyForecast(weeklyForecasts) {
  const finalWeekly = [];
  for (let i = 0; i < 7; i++) {
    const nwsDay = (weeklyForecasts.providerNWS && weeklyForecasts.providerNWS[i]) || { temperature: 0, rainProbability: 0, snowProbability: 0 };
    const owmDay = (weeklyForecasts.providerOWM && weeklyForecasts.providerOWM[i]) || { temperature: 0, rainProbability: 0, snowProbability: 0 };
    const wbDay  = (weeklyForecasts.providerWB  && weeklyForecasts.providerWB[i])  || { temperature: 0, rainProbability: 0, snowProbability: 0 };

    const temp =
      (nwsDay.temperature * providerWeights.providerNWS.temp) +
      (owmDay.temperature * providerWeights.providerOWM.temp) +
      (wbDay.temperature  * providerWeights.providerWB.temp);
    const rain =
      (nwsDay.rainProbability * providerWeights.providerNWS.rain) +
      (owmDay.rainProbability * providerWeights.providerOWM.rain) +
      (wbDay.rainProbability  * providerWeights.providerWB.rain);
    const snow =
      (nwsDay.snowProbability * providerWeights.providerNWS.snow) +
      (owmDay.snowProbability * providerWeights.providerOWM.snow) +
      (wbDay.snowProbability  * providerWeights.providerWB.snow);
    finalWeekly.push({
      temperature: temp,
      rainProbability: rain,
      snowProbability: snow
    });
  }
  return finalWeekly;
}

/**
 * 가중치 업데이트:
 * 이전 예보와 실제 관측 데이터를 비교하여 오차에 비례해 가중치를 조정.
 */
function updateWeights(oldForecast, actualObservation) {
  const alpha = 0.01; // 조정 계수
  for (const provider in oldForecast) {
    const f = oldForecast[provider];
    const a = actualObservation[provider];
    if (!f || !a || !providerWeights[provider]) continue;
    const tempError = Math.abs(f.temperature - a.temperature);
    const rainError = Math.abs(f.rainProbability - a.rainProbability);
    const snowError = Math.abs(f.snowProbability - a.snowProbability);
    providerWeights[provider].temp = Math.max(0, providerWeights[provider].temp - alpha * tempError);
    providerWeights[provider].rain = Math.max(0, providerWeights[provider].rain - alpha * rainError);
    providerWeights[provider].snow = Math.max(0, providerWeights[provider].snow - alpha * snowError);
  }
  normalizeWeights();
  recordWeightHistory();
}

/**
 * 가중치 정규화:
 * 모든 제공자의 가중치 합이 1이 되도록 조정.
 */
function normalizeWeights() {
  let tempSum = 0, rainSum = 0, snowSum = 0;
  Object.values(providerWeights).forEach(w => {
    tempSum += w.temp;
    rainSum += w.rain;
    snowSum += w.snow;
  });
  if (tempSum === 0) tempSum = 1;
  if (rainSum === 0) rainSum = 1;
  if (snowSum === 0) snowSum = 1;
  Object.values(providerWeights).forEach(w => {
    w.temp /= tempSum;
    w.rain /= rainSum;
    w.snow /= snowSum;
  });
}

/**
 * 정확도 기록:
 * 각 제공자의 예보와 실제 관측 값의 차이를 기반으로 정확도(%)를 기록.
 */
function recordAccuracy(oldForecast, actualObservation) {
  const time = new Date().toISOString();
  let entry = { time };
  for (const provider in oldForecast) {
    const f = oldForecast[provider];
    const a = actualObservation[provider];
    if (!f || !a) {
      entry[provider] = { tempAcc: "0.0", rainAcc: "0.0", snowAcc: "0.0" };
      continue;
    }
    const tDiff = Math.abs(f.temperature - a.temperature);
    const rDiff = Math.abs(f.rainProbability - a.rainProbability);
    const sDiff = Math.abs(f.snowProbability - a.snowProbability);
    entry[provider] = {
      tempAcc: Math.max(0, ((1 - tDiff) * 100)).toFixed(1),
      rainAcc: Math.max(0, ((1 - rDiff) * 100)).toFixed(1),
      snowAcc: Math.max(0, ((1 - sDiff) * 100)).toFixed(1)
    };
  }
  accuracyHistory.push(entry);
}

/**
 * 가중치 히스토리 기록:
 * 매번 가중치 업데이트 후 현재 providerWeights의 스냅샷을 기록합니다.
 */
function recordWeightHistory() {
  const snapshot = {
    time: new Date().toISOString(),
    providerNWS: { ...providerWeights.providerNWS },
    providerOWM: { ...providerWeights.providerOWM },
    providerWB: { ...providerWeights.providerWB }
  };
  weightHistory.push(snapshot);
}

/**
 * calculateHourlyForecastWithBreakdown:
 * 제공자별 현재 예보 데이터를 바탕으로 각 항목별 최종 예보와 계산 내역(각 제공자의 기여도)을 반환.
 */
function calculateHourlyForecastWithBreakdown(forecasts) {
  let tempSum = 0, rainSum = 0, snowSum = 0;
  let tempCalc = [], rainCalc = [], snowCalc = [];
  for (const provider in forecasts) {
    const f = forecasts[provider];
    if (!f) continue;
    const w = providerWeights[provider] || { temp: 0, rain: 0, snow: 0 };
    const tempContribution = f.temperature * w.temp;
    const rainContribution = f.rainProbability * w.rain;
    const snowContribution = f.snowProbability * w.snow;
    tempCalc.push({ provider, value: f.temperature, weight: w.temp, contribution: tempContribution });
    rainCalc.push({ provider, value: f.rainProbability, weight: w.rain, contribution: rainContribution });
    snowCalc.push({ provider, value: f.snowProbability, weight: w.snow, contribution: snowContribution });
    tempSum += tempContribution;
    rainSum += rainContribution;
    snowSum += snowContribution;
  }
  return {
    temperature: tempSum,
    rainProbability: rainSum,
    snowProbability: snowSum,
    calculation: {
      temperature: tempCalc,
      rainProbability: rainCalc,
      snowProbability: snowCalc
    }
  };
}

/**
 * getAccuracyHistory: 누적된 정확도 기록 반환
 */
function getAccuracyHistory() {
  return accuracyHistory;
}

/**
 * getWeights: 현재 가중치 반환
 */
function getWeights() {
  return providerWeights;
}

/**
 * getWeightHistory: 누적된 가중치 기록 반환
 */
function getWeightHistory() {
  return weightHistory;
}

/**
 * setWeights: 외부에서 가중치를 직접 수정할 수 있도록 지원
 */
function setWeights(newWeights) {
  providerWeights = newWeights;
}

module.exports = {
  calculateFinalForecast,
  calculateFinalWeeklyForecast,
  updateWeights,
  getWeights,
  getAccuracyHistory,
  recordAccuracy,
  setWeights,
  calculateHourlyForecastWithBreakdown,
  getWeightHistory
};