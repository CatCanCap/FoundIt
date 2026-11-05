import { describe, it, expect } from 'vitest'
import {
  LABEL_POSITIONS,
  buildingCentres,
  buildingLabel,
  buildingsFromSpots,
  describeBuilding,
  heatGeoJson,
  heatScale,
  labelCentres,
  mapTiles,
  spotsAtMarkers,
} from '../campus-layout'

describe('mapTiles', () => {
  it('places known buildings and only the ones asked for', () => {
    const tiles = mapTiles(['SCIS 1', 'LKCSB'])
    expect(tiles.map((tile) => tile.building)).toEqual(['SCIS 1', 'LKCSB'])
  })

  it('still shows a building the layout does not know, in a row below', () => {
    const tiles = mapTiles(['SCIS 1', 'New Building'])
    const extra = tiles.find((tile) => tile.building === 'New Building')
    expect(extra.area).toBe('4 / 1 / 5 / 2')
  })
})

describe('buildingLabel and buildingsFromSpots', () => {
  it('shortens long building names for the map', () => {
    expect(buildingLabel('Li Ka Shing Library')).toBe('LKS Library')
    expect(buildingLabel('Somewhere else')).toBe('Somewhere else')
  })

  it('lists each building once', () => {
    const spots = [{ building: 'SOA' }, { building: 'SOA' }, { building: 'LKCSB' }]
    expect(buildingsFromSpots(spots)).toEqual(['SOA', 'LKCSB'])
  })
})

describe('heatScale', () => {
  it('scales by square root, so 4 times the items is twice the size', () => {
    expect(heatScale(4, 16)).toBe(0.5)
    expect(heatScale(16, 16)).toBe(1)
  })

  it('is zero when there is nothing', () => {
    expect(heatScale(0, 10)).toBe(0)
    expect(heatScale(3, 0)).toBe(0)
  })
})

describe('Mapbox helpers', () => {
  const spots = [
    { id: 1, building: 'SCIS 1', coordinates: { lat: 1.2972, lng: 103.849 } },
    { id: 2, building: 'SCIS 1', coordinates: { lat: 1.2974, lng: 103.8492 } },
    { id: 3, building: 'Li Ka Shing Library', coordinates: { lat: 1.2966, lng: 103.85 } },
  ]

  it('puts each building at the average of its spots', () => {
    const [scis] = buildingCentres(spots)
    expect(scis.building).toBe('SCIS 1')
    expect(scis.lat).toBeCloseTo(1.2973)
    expect(scis.lng).toBeCloseTo(103.8491)
  })

  it('puts the marker of a known building at its middle, not at its spots', () => {
    const [scis] = labelCentres(spots)
    expect(scis.building).toBe('SCIS 1')
    expect(scis.lat).toBe(LABEL_POSITIONS['SCIS 1'].lat)
    expect(scis.lng).toBe(LABEL_POSITIONS['SCIS 1'].lng)
  })

  it('still puts the marker of an unknown building at the average of its spots', () => {
    const unknown = spots.map((spot) => ({ ...spot, building: 'New Block' }))
    const [centre] = labelCentres(unknown)
    expect(centre).toEqual(buildingCentres(unknown)[0])
  })

  it('moves every spot to where its building marker stands, for the heatmap', () => {
    const moved = spotsAtMarkers(spots)
    const [scis] = labelCentres(spots)
    expect(moved).toHaveLength(spots.length)
    for (const spot of moved.filter((entry) => entry.building === 'SCIS 1')) {
      expect(spot.coordinates).toEqual({ lat: scis.lat, lng: scis.lng })
    }
    expect(moved[0].id).toBe(spots[0].id)
  })

  it('makes one heatmap point per spot, in [lng, lat] order, skipping unknown spots', () => {
    const data = heatGeoJson(
      [
        { spotId: 3, count: 5 },
        { spotId: 99, count: 1 },
      ],
      spots,
    )
    expect(data.features).toHaveLength(1)
    expect(data.features[0].geometry.coordinates).toEqual([103.85, 1.2966])
    expect(data.features[0].properties.weight).toBe(1)
  })

  it('weighs each point against the busiest spot', () => {
    const placed = spots.filter((spot) => spot.coordinates).slice(0, 2)
    const data = heatGeoJson(
      [
        { spotId: placed[0].id, count: 4 },
        { spotId: placed[1].id, count: 1 },
      ],
      spots,
    )
    expect(data.features.map((feature) => feature.properties.weight)).toEqual([1, 0.25])
  })
})

describe('describeBuilding', () => {
  it('names the building, then its count and trail stops', () => {
    expect(describeBuilding('SCIS 1', 3, [1, 2], 'found')).toBe('SCIS 1, 3 items, stop 1 and 2')
    expect(describeBuilding('LKCSB', 1, [], 'lost')).toBe('LKCSB, 1 lost report')
    expect(describeBuilding('SOA', 0, undefined, 'found')).toBe('SOA')
  })
})
