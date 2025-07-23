//components/ScheduledDateTimePicker.tsx
'use client';

import type React from 'react';

interface ScheduledDateTimePickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minDateTime?: string;
  maxDateTime?: string;
  className?: string;
}

const ScheduledDateTimePicker: React.FC<ScheduledDateTimePickerProps> = ({
  label = "Data e Hora Agendada",
  value,
  onChange,
  required = false,
  minDateTime,
  maxDateTime,
  className = "",
}) => {
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1" htmlFor="scheduledDateTime">
          {label}
        </label>
      )}
      <input
        type="datetime-local"
        id="scheduledDateTime"
        name="scheduledDateTime"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={minDateTime}
        max={maxDateTime}
        className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
};

export default ScheduledDateTimePicker;
