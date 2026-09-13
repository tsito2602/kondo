import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { palette } from '@/constants/design';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={palette.canvas}
      indicatorColor={palette.sky}
      tintColor={palette.ocean}
      iconColor={{ default: palette.smoke, selected: palette.ocean }}
      labelStyle={{ default: { color: palette.slate }, selected: { color: palette.ink, fontWeight: '700' } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>旅</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="itinerary">
        <NativeTabs.Trigger.Label>日程</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar.circle.fill' }} md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="packing">
        <NativeTabs.Trigger.Label>準備</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'checklist', selected: 'checklist.checked' }} md="checklist" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bookings">
        <NativeTabs.Trigger.Label>予約</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'ticket', selected: 'ticket.fill' }} md="confirmation_number" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
