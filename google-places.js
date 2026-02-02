const db = require('./db');

const API_BASE = 'https://places.googleapis.com/v1/places:searchText';
const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

// Field mask for Google Places API
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.primaryType',
  'places.types',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.regularOpeningHours',
  'places.priceLevel',
  'places.businessStatus',
  'places.photos',
  'nextPageToken'
].join(',');

// Grid sizes configuration
const GRID_SIZES = {
  small: 2,   // 2x2 = 4 cells
  medium: 3,  // 3x3 = 9 cells
  large: 5    // 5x5 = 25 cells
};

async function geocodeLocation(location, apiKey) {
  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(location)}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Could not geocode location: ${location}`);
  }

  const result = data.results[0];
  const bounds = result.geometry.viewport || result.geometry.bounds;

  if (!bounds) {
    // If no bounds, create a small area around the point
    const loc = result.geometry.location;
    return {
      north: loc.lat + 0.1,
      south: loc.lat - 0.1,
      east: loc.lng + 0.1,
      west: loc.lng - 0.1
    };
  }

  return {
    north: bounds.northeast.lat,
    south: bounds.southwest.lat,
    east: bounds.northeast.lng,
    west: bounds.southwest.lng
  };
}

function generateGrid(bounds, gridSize) {
  const cells = [];
  const latStep = (bounds.north - bounds.south) / gridSize;
  const lngStep = (bounds.east - bounds.west) / gridSize;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      cells.push({
        south: bounds.south + (i * latStep),
        north: bounds.south + ((i + 1) * latStep),
        west: bounds.west + (j * lngStep),
        east: bounds.west + ((j + 1) * lngStep)
      });
    }
  }

  return cells;
}

async function searchPlaces(query, bounds, apiKey, existingPlaceIds, onProgress) {
  const results = [];
  let pageToken = null;
  let pageNum = 0;

  do {
    const body = {
      textQuery: query,
      locationRestriction: {
        rectangle: {
          low: { latitude: bounds.south, longitude: bounds.west },
          high: { latitude: bounds.north, longitude: bounds.east }
        }
      },
      pageSize: 20
    };

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK
      },
      body: JSON.stringify(body)
    });

    // Track API usage
    db.incrementApiUsage(1);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Places API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (data.places) {
      for (const place of data.places) {
        // Skip if we already have this place
        if (existingPlaceIds.has(place.id)) {
          continue;
        }

        results.push(transformPlace(place));
        existingPlaceIds.add(place.id);
      }
    }

    pageToken = data.nextPageToken;
    pageNum++;

    if (onProgress) {
      onProgress({ page: pageNum, resultsCount: results.length });
    }

    // Small delay between pages to be nice to the API
    if (pageToken) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

  } while (pageToken && pageNum < 3); // Max 3 pages per search

  return results;
}

function transformPlace(place) {
  return {
    place_id: place.id,
    name: place.displayName?.text || null,
    address: place.formattedAddress || null,
    category: place.primaryType || null,
    website: place.websiteUri || null,
    rating: place.rating || null,
    rating_count: place.userRatingCount || null,
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    opening_hours: place.regularOpeningHours ? JSON.stringify(place.regularOpeningHours) : null,
    price_level: place.priceLevel ? parseInt(place.priceLevel.replace('PRICE_LEVEL_', '')) : null,
    business_status: place.businessStatus || null,
    lat: place.location?.latitude || null,
    lng: place.location?.longitude || null,
    photos: place.photos ? JSON.stringify(place.photos.map(p => p.name)) : null,
    types: place.types ? JSON.stringify(place.types) : null,
    raw_data: JSON.stringify(place)
  };
}

async function runSearch(searchId, query, location, gridSize, apiKey, limit, onProgress) {
  const gridNum = GRID_SIZES[gridSize] || GRID_SIZES.medium;

  // Check rate limit
  const usage = db.getApiUsage();
  if (usage.request_count >= limit) {
    throw new Error(`API limit reached (${usage.request_count}/${limit} requests this month)`);
  }

  // Get existing place IDs to avoid duplicates
  const existingPlaceIds = db.getExistingPlaceIds();

  // Geocode location to get bounds
  onProgress?.({ status: 'geocoding', message: `Getting bounds for ${location}...` });
  const bounds = await geocodeLocation(location, apiKey);
  db.incrementApiUsage(1); // Geocoding counts as 1 request

  // Generate grid
  const cells = generateGrid(bounds, gridNum);
  onProgress?.({ status: 'searching', message: `Searching ${cells.length} grid cells...`, totalCells: cells.length });

  let totalResults = 0;
  let newResults = 0;

  for (let i = 0; i < cells.length; i++) {
    // Check rate limit before each cell
    const currentUsage = db.getApiUsage();
    if (currentUsage.request_count >= limit) {
      onProgress?.({ status: 'limit_reached', message: `API limit reached after ${i} cells` });
      break;
    }

    const cell = cells[i];
    onProgress?.({ status: 'searching', message: `Searching cell ${i + 1}/${cells.length}...`, cell: i + 1, totalCells: cells.length });

    try {
      const places = await searchPlaces(query, cell, apiKey, existingPlaceIds, null);

      for (const place of places) {
        const { isNew } = db.upsertCompany(place, searchId);
        totalResults++;
        if (isNew) newResults++;
      }

      onProgress?.({ status: 'progress', cell: i + 1, totalCells: cells.length, totalResults, newResults });

    } catch (error) {
      console.error(`Error searching cell ${i + 1}:`, error.message);
      // Continue with other cells
    }

    // Small delay between cells
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Update search with final count
  db.updateSearchStatus(searchId, 'completed', totalResults);

  return { totalResults, newResults };
}

module.exports = {
  runSearch,
  geocodeLocation,
  generateGrid,
  searchPlaces,
  GRID_SIZES
};
