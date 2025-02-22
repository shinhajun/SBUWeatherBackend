require('dotenv').config();
const axios = require('axios');

/**
 * NWS 현재 예보
 */
async function getNWSForecast(lat, lon) {
  try {
    const userAgent = 'MyWeatherBackend (example@example.com)';
    const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
    const pointsResp = await axios.get(pointsUrl, { headers: { 'User-Agent': userAgent } });
    const forecastUrl = pointsResp.data.properties.forecast;
    if (!forecastUrl) throw new Error('NWS forecast URL not found');

    const fcResp = await axios.get(forecastUrl, { headers: { 'User-Agent': userAgent } });
    const periods = fcResp.data.properties.periods || [];
    if (periods.length === 0) throw new Error('NWS periods empty');

    const firstPeriod = periods[0];
    const tempF = firstPeriod.temperature;
    const tempC = (tempF - 32) * (5 / 9);
    const shortText = (firstPeriod.shortForecast || '').toLowerCase();
    const hasRain = shortText.includes('rain');
    const hasSnow = shortText.includes('snow');

    return {
      temperature: tempC,
      rainProbability: hasRain ? 0.5 : 0.0,
      snowProbability: hasSnow ? 0.3 : 0.0
    };
  } catch (err) {
    console.error('NWS error:', err.message);
    return null;
  }
}

/**
 * NWS 주간 예보
 */
async function getNWSWeeklyForecast(lat, lon) {
  try {
    const userAgent = 'MyWeatherBackend (example@example.com)';
    const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
    const pointsResp = await axios.get(pointsUrl, { headers: { 'User-Agent': userAgent } });
    const forecastUrl = pointsResp.data.properties.forecast;
    if (!forecastUrl) throw new Error('NWS forecast URL not found');

    const fcResp = await axios.get(forecastUrl, { headers: { 'User-Agent': userAgent } });
    const periods = fcResp.data.properties.periods || [];
    if (periods.length === 0) throw new Error('NWS periods empty');

    let daytimePeriods = periods.filter(p => p.isDaytime);
    if (daytimePeriods.length < 7) daytimePeriods = periods;
    const weekly = daytimePeriods.slice(0, 7).map(period => {
      const tempF = period.temperature;
      const tempC = (tempF - 32) * (5 / 9);
      const shortText = (period.shortForecast || '').toLowerCase();
      const hasRain = shortText.includes('rain');
      const hasSnow = shortText.includes('snow');
      return {
        temperature: tempC,
        rainProbability: hasRain ? 0.5 : 0.0,
        snowProbability: hasSnow ? 0.3 : 0.0
      };
    });
    while (weekly.length < 7) {
      weekly.push({ temperature: 0, rainProbability: 0, snowProbability: 0 });
    }
    return weekly;
  } catch (err) {
    console.error('NWS Weekly error:', err.message);
    return Array(7).fill({ temperature: 0, rainProbability: 0, snowProbability: 0 });
  }
}

/**
 * OWM 현재 예보
 * 여기에 디버그 로그를 추가하여 API 키와 요청 URL, 응답 데이터를 확인
 */
async function getOWMForecast(lat, lon) {
  try {
    const apiKey = process.env.OWM_KEY;
    console.log('[DEBUG] OWM Forecast - Using API key:', apiKey);

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    console.log('[DEBUG] OWM Forecast - Request URL:', url);

    const resp = await axios.get(url);
    console.log('[DEBUG] OWM Forecast - Response data:', JSON.stringify(resp.data, null, 2));

    const data = resp.data;
    const temperature = data.main?.temp ?? 0;
    const weather = data.weather?.[0]?.main?.toLowerCase() || '';
    const hasRain = weather.includes('rain');
    const hasSnow = weather.includes('snow');

    return {
      temperature,
      rainProbability: hasRain ? 0.4 : 0.0,
      snowProbability: hasSnow ? 0.2 : 0.0
    };
  } catch (err) {
    console.error('OWM error:', err.message);
    // 추가 디버그: err.response가 있으면 상태코드/데이터도 출력
    if (err.response) {
      console.error('OWM error response status:', err.response.status);
      console.error('OWM error response data:', err.response.data);
    }
    return null;
  }
}

/**
 * OWM 주간 예보 (OneCall API)
 * 여기에 디버그 로그를 추가하여 API 키와 요청 URL, 응답 데이터를 확인
 */
async function getOWMWeeklyForecast(lat, lon) {
  try {
    const apiKey = process.env.OWM_KEY;
    console.log('[DEBUG] OWM Weekly Forecast - Using API key:', apiKey);

    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,alerts&units=metric&appid=${apiKey}`;
    console.log('[DEBUG] OWM Weekly Forecast - Request URL:', url);

    const resp = await axios.get(url);
    console.log('[DEBUG] OWM Weekly Forecast - Response data:', JSON.stringify(resp.data, null, 2));

    const daily = resp.data.daily || [];
    const weekly = daily.slice(0, 7).map(day => {
      const temperature = day.temp.day;
      const rainProbability = day.pop || 0; // 0~1 사이 값
      const hasSnow = day.snow && day.snow > 0;
      const snowProbability = hasSnow ? 0.3 : 0.0;
      return {
        temperature,
        rainProbability,
        snowProbability
      };
    });
    while (weekly.length < 7) {
      weekly.push({ temperature: 0, rainProbability: 0, snowProbability: 0 });
    }
    return weekly;
  } catch (err) {
    console.error('OWM Weekly error:', err.message);
    // 추가 디버그
    if (err.response) {
      console.error('OWM Weekly error response status:', err.response.status);
      console.error('OWM Weekly error response data:', err.response.data);
    }
    return Array(7).fill({ temperature: 0, rainProbability: 0, snowProbability: 0 });
  }
}

/**
 * WeatherBit 현재 예보
 */
async function getWeatherBitForecast(lat, lon) {
  try {
    const apiKey = process.env.WB_KEY;
    const url = `https://api.weatherbit.io/v2.0/current?lat=${lat}&lon=${lon}&key=${apiKey}`;
    const resp = await axios.get(url);
    const data = resp.data?.data?.[0];
    if (!data) throw new Error('WB data not found');

    const temperature = data.temp ?? 0;
    const code = data.weather?.code ?? 800;
    let rainProb = 0, snowProb = 0;
    if (code >= 500 && code < 600) rainProb = 0.5;
    if (code >= 600 && code < 700) snowProb = 0.4;

    return {
      temperature,
      rainProbability: rainProb,
      snowProbability: snowProb
    };
  } catch (err) {
    console.error('WB error:', err.message);
    return null;
  }
}

/**
 * WeatherBit 주간 예보
 */
async function getWeatherBitWeeklyForecast(lat, lon) {
  try {
    const apiKey = process.env.WB_KEY;
    const url = `https://api.weatherbit.io/v2.0/forecast/daily?lat=${lat}&lon=${lon}&key=${apiKey}`;
    const resp = await axios.get(url);
    const dataArray = resp.data?.data;
    if (!dataArray || dataArray.length === 0) throw new Error('WB weekly data not found');

    const weekly = dataArray.slice(0, 7).map(day => {
      const temperature = day.temp ?? 0;
      const pop = day.pop ? day.pop / 100 : 0; // 0~1 사이 값
      const code = day.weather?.code ?? 800;
      let snowProbability = 0;
      if (code >= 600 && code < 700) snowProbability = 0.4;
      return {
        temperature,
        rainProbability: pop,
        snowProbability
      };
    });
    while (weekly.length < 7) {
      weekly.push({ temperature: 0, rainProbability: 0, snowProbability: 0 });
    }
    return weekly;
  } catch (err) {
    console.error('WB Weekly error:', err.message);
    return Array(7).fill({ temperature: 0, rainProbability: 0, snowProbability: 0 });
  }
}

/**
 * 병렬 호출: 현재 예보 (세 제공자 데이터 통합)
 */
async function getAllForecasts(lat, lon) {
  const [nws, owm, wb] = await Promise.all([
    getNWSForecast(lat, lon),
    getOWMForecast(lat, lon),
    getWeatherBitForecast(lat, lon)
  ]);
  return {
    providerNWS: nws,
    providerOWM: owm,
    providerWB: wb
  };
}

/**
 * 병렬 호출: 주간 예보 (세 제공자 7일치 데이터 통합)
 */
async function getWeeklyForecasts(lat, lon) {
  const [nws, owm, wb] = await Promise.all([
    getNWSWeeklyForecast(lat, lon),
    getOWMWeeklyForecast(lat, lon),
    getWeatherBitWeeklyForecast(lat, lon)
  ]);
  return {
    providerNWS: nws,
    providerOWM: owm,
    providerWB: wb
  };
}

module.exports = {
  getAllForecasts,
  getWeeklyForecasts
};