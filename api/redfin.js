export default async function handler(req, res) {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: 'Address parameter required' });
  }

  const API_KEY = process.env.REDFIN_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-rapidapi-host': 'redfin-com-data.p.rapidapi.com',
    'x-rapidapi-key': API_KEY,
  };

  function timedFetch(url, opts, ms = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  try {
    // Step 1: Search for property (25s timeout)
    const searchRes = await timedFetch(
      `https://redfin-com-data.p.rapidapi.com/property/search?location=${encodeURIComponent(address)}`,
      { headers }
    );
    const searchData = await searchRes.json();

    let propertyUrl = null;
    let propertyName = address;

    if (searchData.data && Array.isArray(searchData.data) && searchData.data.length > 0) {
      propertyUrl = searchData.data[0].url;
      propertyName = searchData.data[0].streetAddress || address;
    } else if (searchData.suggestionLocation && searchData.suggestionLocation.length > 0) {
      const suggestion = searchData.suggestionLocation[0];
      propertyUrl = suggestion.url;
      propertyName = suggestion.location + ', ' + suggestion.sub_location;
    }

    if (!propertyUrl) {
      return res.status(404).json({ error: 'Property not found', address });
    }

    // Step 2: Get property details (30s timeout — this call is slower)
    const detailRes = await timedFetch(
      `https://redfin-com-data.p.rapidapi.com/property/detail?url=${encodeURIComponent(propertyUrl)}`,
      { headers },
      30000
    );
    const detailData = await detailRes.json();

    const info = detailData?.data?.aboveTheFold?.addressSectionInfo;
    if (!info) {
      return res.status(200).json({
        address: propertyName,
        value: null,
        source: 'Redfin (details unavailable)',
        url: 'https://www.redfin.com' + propertyUrl,
        note: 'Property found but details could not be loaded.',
      });
    }

    const value = info.priceInfo?.amount || info.avmInfo?.predictedValue || null;

    return res.status(200).json({
      address: propertyName,
      value: value ? Math.round(value) : null,
      source: info.priceInfo?.label || 'Redfin Estimate',
      beds: info.beds || null,
      baths: info.baths || null,
      sqft: info.sqFt?.value || null,
      yearBuilt: info.yearBuilt || null,
      lotSize: info.lotSize || null,
      status: info.homeStatusLabel || null,
      url: 'https://www.redfin.com' + propertyUrl,
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timed out — try again' : 'Lookup failed: ' + err.message;
    return res.status(500).json({ error: msg, address });
  }
}
