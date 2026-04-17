import axios from 'axios';

export async function fetchOpenWeather(city) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key || !city) return null;

  const { data } = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
    params: {
      q: city,
      appid: key,
      units: 'metric',
    },
    timeout: 6000,
  });

  const rainfall = Number(data?.rain?.['1h'] || data?.rain?.['3h'] || 0);

  return {
    city: data?.name || city,
    rainfall,
    temperature: data?.main?.temp,
    weatherMain: data?.weather?.[0]?.main || 'Unknown',
    weatherDescription: data?.weather?.[0]?.description || 'unknown',
    source: 'openweather',
  };
}

export async function getWeatherMeta({ city, rainfall = 0 }) {
  const weatherMeta = await fetchOpenWeather(city);
  if (weatherMeta) return weatherMeta;

  return {
    city: city || 'Unknown',
    rainfall: Number(rainfall || 0),
    source: 'manual',
  };
}
