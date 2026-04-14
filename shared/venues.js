/**
 * PSL FanChain - Shared Venues Configuration
 * 
 * This module loads venues from venues.json and provides
 * a consistent interface for all services.
 * 
 * Usage (ESM):
 *   import { getVenues, getVenueById, getStadiumOptions } from './shared/venues.js';
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load venues from JSON
const venuesPath = path.join(__dirname, '..', 'venues', 'venues.json');
let venues = {};

try {
  const venuesData = fs.readFileSync(venuesPath, 'utf8');
  venues = JSON.parse(venuesData);
} catch (err) {
  console.error('Failed to load venues.json:', err.message);
}

/**
 * Get all venues
 * @returns {Object} venues object
 */
function getVenues() {
  return venues;
}

/**
 * Get venue by key (name)
 * @param {string} key - Venue name
 * @returns {Object|null} venue object or null
 */
function getVenueByKey(key) {
  return venues[key] || null;
}

/**
 * Get venue by city name
 * @param {string} city - City name
 * @returns {Array} array of venues in that city
 */
function getVenuesByCity(city) {
  return Object.entries(venues)
    .filter(([, v]) => v.city?.toLowerCase() === city.toLowerCase())
    .map(([key, v]) => ({ id: key, ...v }));
}

/**
 * Get all stadiums (non-event venues)
 * @returns {Array} array of stadium objects
 */
function getStadiums() {
  return Object.entries(venues)
    .filter(([, v]) => !v.isEvent)
    .map(([key, v]) => ({ id: key, ...v }));
}

/**
 * Get all events
 * @returns {Array} array of event objects
 */
function getEvents() {
  return Object.entries(venues)
    .filter(([, v]) => v.isEvent)
    .map(([key, v]) => ({ id: key, ...v }));
}

/**
 * Get all venue options for dropdowns
 * @returns {Array} array of { value, label } objects
 */
function getVenueOptions() {
  return Object.keys(venues).map(key => ({
    value: key,
    label: venues[key].stadiumName || key,
    city: venues[key].city,
    isEvent: venues[key].isEvent || false
  }));
}

/**
 * Get all stadium options (for campaign creation)
 * @returns {Array} array of { value, label } objects
 */
function getStadiumOptions() {
  return getVenueOptions().filter(v => !v.isEvent);
}

/**
 * Validate if a venue key exists
 * @param {string} key - Venue key to validate
 * @returns {boolean} true if valid
 */
function isValidVenue(key) {
  return !!venues[key];
}

/**
 * Get coordinates for a venue
 * @param {string} key - Venue key
 * @returns {Object} { lat, lng } or null
 */
function getCoordinates(key) {
  const venue = venues[key];
  if (!venue) return null;
  return { lat: venue.lat, lng: venue.lng };
}

export default {
  venues,
  getVenues,
  getVenueByKey,
  getVenuesByCity,
  getStadiums,
  getEvents,
  getVenueOptions,
  getStadiumOptions,
  isValidVenue,
  getCoordinates
};