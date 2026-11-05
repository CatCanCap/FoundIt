import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TrailStops from '../TrailStops.vue'
import { earliestDay } from '@/utils/trail'
import { singaporeDate } from '@/utils/report'

const spots = [
  { id: 1, building: 'SCIS 1', floor: 'Level 2', area: 'Lift lobby' },
  { id: 2, building: 'SCIS 1', floor: 'Level 3', area: 'Study area' },
  { id: 3, building: 'LKCSB', floor: 'Level 1', area: 'Concourse' },
]

// Mounts the trail like the lost report does: each update:stops is passed back
// in as the new stops, so wrapper.props('stops') is always the latest list
function mountTrail(stops) {
  const wrapper = mount(TrailStops, {
    props: {
      spots,
      date: '2026-10-14',
      stops,
      'onUpdate:stops': (newStops) => wrapper.setProps({ stops: newStops }),
    },
    global: { stubs: { CampusMap: true } },
  })
  return wrapper
}

async function addByList(wrapper, building) {
  await wrapper.find('[data-testid="lost-add-stop"]').trigger('click')
  await wrapper.find('[data-testid="lost-add-building"]').setValue(building)
}

describe('TrailStops', () => {
  it('leaves the part of the building and the times for the owner to fill in', async () => {
    const wrapper = mountTrail([])
    await addByList(wrapper, 'SCIS 1')
    expect(wrapper.props('stops')[0]).toMatchObject({
      building: 'SCIS 1',
      spotId: '',
      start: '',
      end: '',
    })
  })

  it('gives a new stop a key no other stop has, when the step is shown again', async () => {
    // Coming back to the trail step mounts the component again with the stops
    // already added; the next key carries on from them
    const stops = [
      { key: 1, building: 'SCIS 1', spotId: 1, start: '09:00', end: '10:00' },
      { key: 2, building: 'LKCSB', spotId: 3, start: '10:00', end: '11:00' },
    ]
    const wrapper = mountTrail(stops)
    await addByList(wrapper, 'LKCSB')
    expect(wrapper.props('stops').map((stop) => stop.key)).toEqual([1, 2, 3])
  })

  it('sends changes back as a new list instead of changing the one it was given', async () => {
    const stops = [{ key: 1, building: 'SCIS 1', spotId: '', start: '', end: '' }]
    const wrapper = mountTrail(stops)
    await wrapper.find('[data-testid="lost-stop-start-1"]').setValue('09:00')
    await wrapper.find('[data-testid="lost-stop-spot-1"]').setValue('2')
    expect(wrapper.props('stops')[0]).toMatchObject({ start: '09:00', spotId: 2 })
    // The boxes show what was picked after the new list comes back
    expect(wrapper.find('[data-testid="lost-stop-spot-1"]').element.value).toBe('2')
    expect(wrapper.find('[data-testid="lost-stop-start-1"]').element.value).toBe('09:00')
    // The list the lost report passed in is left as it was
    expect(stops[0]).toMatchObject({ start: '', spotId: '' })
    await wrapper.find('[data-testid="lost-date"]').setValue('2026-10-13')
    expect(wrapper.emitted('update:date')).toEqual([['2026-10-13']])
  })

  it('labels the part of the building only when there is a choice to make', async () => {
    const stops = [
      { key: 1, building: 'SCIS 1', spotId: '', start: '09:00', end: '10:00' },
      { key: 2, building: 'LKCSB', spotId: 3, start: '10:00', end: '11:00' },
    ]
    const wrapper = mountTrail(stops)
    expect(wrapper.find('label[for="stop-spot-1"]').exists()).toBe(true)
    expect(wrapper.find('#stop-spot-1').exists()).toBe(true)
    // LKCSB has one spot, so there is no select and no label left on its own
    expect(wrapper.find('label[for="stop-spot-2"]').exists()).toBe(false)
    expect(wrapper.find('#stop-spot-2').exists()).toBe(false)
  })

  it('lets the day box go back about a year and no further than today', () => {
    const wrapper = mountTrail([])
    const day = wrapper.find('[data-testid="lost-date"]')
    expect(day.attributes('min')).toBe(earliestDay())
    expect(day.attributes('max')).toBe(singaporeDate(new Date()))
  })
})
