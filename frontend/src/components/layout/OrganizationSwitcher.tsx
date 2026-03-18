/**
 * Organization switcher dropdown component.
 */

import { useState, useRef, useEffect } from 'react';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface OrganizationSwitcherProps {
  onCreateOrg?: () => void;
}

export default function OrganizationSwitcher({ onCreateOrg }: OrganizationSwitcherProps) {
  const { organizations, currentOrg, setCurrentOrg } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!currentOrg) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm"
      >
        <Building2 className="w-4 h-4 text-gray-500" />
        <span className="font-medium text-gray-700 max-w-[150px] truncate">
          {currentOrg.organization_name}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Organizations
          </div>

          {organizations.map((org) => (
            <button
              key={org.organization_id}
              onClick={() => {
                setCurrentOrg(org);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {org.organization_name}
                </p>
                <p className="text-xs text-gray-500 capitalize">{org.role}</p>
              </div>
              {org.organization_id === currentOrg.organization_id && (
                <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
              )}
            </button>
          ))}

          {onCreateOrg && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => {
                  onCreateOrg();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left text-primary-600"
              >
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Create organization</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
