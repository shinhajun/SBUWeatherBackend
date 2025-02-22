require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const { getAllForecasts, getWeeklyForecasts } = require('./services/weatherService');
const {
  calculateFinalForecast,
  calculateFinalWeeklyForecast,
  updateWeights,
  getWeights,
  getAccuracyHistory,
  recordAccuracy,
  calculateHourlyForecastWithBreakdown,
  getWeightHistory
} = require('./services/weightingService');

app.use(cors());
app.use(express.json());

// 좌표 (Stony Brook, NY)
const LAT = 40.9257;
const LON = -73.1410;

// 메모리에 예보 및 가중치 저장 (예시)
let previousForecast = null;
let latestForecast = null;
let finalForecast = null;
let finalWeeklyForecast = null;
let hourlyForecast = null; // Next 1 Hour Forecast (계산 내역 포함)

// 하루 통계 (추후 실제 관측 데이터 연동 가능)
let dailyOverview = {
  lowestTemp: 18,
  highestTemp: 28,
  totalPrecip: 5
};

/**
 * 일일 예보 업데이트 함수 (약 1시간 주기)
 */
async function updateDailyForecast() {
  console.log('Fetching new daily forecast data...');
  try {
    let newForecast = await getAllForecasts(LAT, LON);
    if (!newForecast) {
      newForecast = {
        providerNWS: null,
        providerOWM: null,
        providerWB: null
      };
    }
    for (const provider of ['providerNWS', 'providerOWM', 'providerWB']) {
      if (!newForecast[provider]) {
        newForecast[provider] = { temperature: 0, rainProbability: 0, snowProbability: 0 };
      }
    }
    if (previousForecast) {
      updateWeights(previousForecast, newForecast);
      recordAccuracy(previousForecast, newForecast);
    }
    finalForecast = calculateFinalForecast(newForecast);
    hourlyForecast = calculateHourlyForecastWithBreakdown(newForecast);
    previousForecast = newForecast;
    latestForecast = newForecast;
    console.log('Daily forecast updated => final:', finalForecast);
  } catch (err) {
    console.error('Error in updateDailyForecast:', err);
  }
}

/**
 * 주간 예보 업데이트 함수 (7일치 예보)
 */
async function updateWeeklyForecast() {
  console.log('Fetching new weekly forecast data...');
  try {
    let newWeeklyForecast = await getWeeklyForecasts(LAT, LON);
    if (!newWeeklyForecast) {
      newWeeklyForecast = {
        providerNWS: Array(7).fill(null),
        providerOWM: Array(7).fill(null),
        providerWB: Array(7).fill(null)
      };
    }
    for (const provider of ['providerNWS', 'providerOWM', 'providerWB']) {
      newWeeklyForecast[provider] = newWeeklyForecast[provider].map(dayForecast => {
        if (!dayForecast) {
          return { temperature: 0, rainProbability: 0, snowProbability: 0 };
        }
        return dayForecast;
      });
    }
    finalWeeklyForecast = calculateFinalWeeklyForecast(newWeeklyForecast);
    console.log('Weekly forecast updated => finalWeekly:', finalWeeklyForecast);
  } catch (err) {
    console.error('Error in updateWeeklyForecast:', err);
  }
}

/**
 * 주간 예보 업데이트 스케줄러
 */
function scheduleWeeklyUpdate() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight - now;
  console.log(`Weekly update scheduled in ${msUntilMidnight} ms`);
  setTimeout(() => {
    updateWeeklyForecast();
    setInterval(updateWeeklyForecast, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

/**
 * 전체 업데이트 스케줄러
 */
async function startUpdateSchedule() {
  await updateDailyForecast();
  await updateWeeklyForecast();
  // 일일 업데이트: 1시간마다
  setInterval(updateDailyForecast, 60 * 60 * 1000);
  // 주간 업데이트: 매일 자정
  scheduleWeeklyUpdate();
}

// 테스트 라우트
app.get('/', (req, res) => {
  res.send('Weather backend is running.');
});

// API 라우트: 예보 데이터 반환 (hourlyForecast 포함)
app.get('/api/forecast', (req, res) => {
  res.json({
    forecasts: latestForecast,
    finalForecast: finalForecast,
    hourlyForecast: hourlyForecast,
    dailyOverview: dailyOverview,
    weights: getWeights(),
    weeklyForecast: finalWeeklyForecast
  });
});

/**
 * Accuracy 데이터 반환:
 * 기록이 없으면 더미 데이터로 대체
 */
app.get('/api/accuracy', (req, res) => {
  const history = getAccuracyHistory();
  if (history.length === 0) {
    // 테스트용 더미 데이터 (예시로 3건)
    const now = Date.now();
    const dummy = [];
    for (let i = 3; i > 0; i--) {
      dummy.push({
        time: new Date(now - i * 3600000).toISOString(),
        providerNWS: { tempAcc: '80.0', rainAcc: '90.0', snowAcc: '70.0' },
        providerOWM: { tempAcc: '60.0', rainAcc: '50.0', snowAcc: '40.0' },
        providerWB:  { tempAcc: '75.0', rainAcc: '85.0', snowAcc: '65.0' }
      });
    }
    return res.json(dummy);
  }
  res.json(history);
});

/**
 * Weights History (최근 3시간만 반환):
 * 기록이 없으면 더미 데이터로 대체
 */
app.get('/api/weights-history', (req, res) => {
  let history = getWeightHistory();
  if (history.length === 0) {
    // 테스트용 더미 데이터 (예시로 3건)
    const now = Date.now();
    const dummyHistory = [];
    for (let i = 3; i > 0; i--) {
      dummyHistory.push({
        time: new Date(now - i * 3600000).toISOString(),
        providerNWS: { temp: 0.33 - 0.01 * i, rain: 0.33, snow: 0.33 + 0.01 * i },
        providerOWM: { temp: 0.33 + 0.01 * i, rain: 0.33, snow: 0.33 },
        providerWB:  { temp: 0.34, rain: 0.34 - 0.01 * i, snow: 0.34 + 0.01 * i }
      });
    }
    return res.json(dummyHistory);
  } else {
    // 최근 3시간 내의 기록만 필터링
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    history = history.filter(entry => {
      const entryTime = new Date(entry.time);
      return entryTime >= threeHoursAgo;
    });
    return res.json(history);
  }
});

// 서버 리스닝
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Weather backend listening on port ${PORT}`);
  await startUpdateSchedule();
});