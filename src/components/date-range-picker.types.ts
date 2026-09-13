import type { DateRange } from './date-range';

export type DateRangePickerProps = DateRange & {
  disabled?: boolean;
  endLabel?: string;
  endTime?: string;
  label?: string;
  mode?: 'range' | 'single';
  onChange: (range: DateRange & { startTime: string; endTime: string }) => void;
  showTime?: boolean;
  startLabel?: string;
  startTime?: string;
};

