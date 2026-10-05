import React from 'react';
import { ENGINE_FAMILY_CHIPS } from '../utils/masterInventoryLocation';

const EngineFamilyChips = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2" role="group" aria-label="Engine family">
    {ENGINE_FAMILY_CHIPS.map((chip) => {
      const active = value === chip;
      return (
        <button
          key={chip}
          type="button"
          onClick={() => onChange(chip)}
          className={`min-h-[56px] px-4 rounded-full text-base font-semibold border-2 ${
            active
              ? 'bg-red-700 text-white border-red-800'
              : 'bg-white text-gray-900 border-gray-400 hover:border-red-700 dark:bg-gray-900 dark:text-white dark:border-gray-500'
          }`}
        >
          {chip}
        </button>
      );
    })}
  </div>
);

export default EngineFamilyChips;
