import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PhonePage } from './PhonePage';
import { mockServerConfig } from '../../test/mock-data';

const phoneServer = {
  ...mockServerConfig,
  id: 'phone-1',
  name: 'Test Phone',
  device_type: 'phone' as const,
};

vi.mock('../../lib/fleet-api', () => ({
  getPhoneDeviceInfo: vi.fn(),
  getPhoneBattery: vi.fn(),
  getPhoneThermal: vi.fn(),
  getPhoneStorage: vi.fn(),
  getPhoneMemory: vi.fn(),
  getPhoneScreen: vi.fn(),
  getPhoneNetwork: vi.fn(),
  getPhoneActivity: vi.fn(),
  getKdeConnectBattery: vi.fn(),
  getKdeConnectNotifications: vi.fn(),
  getKdeConnectMpris: vi.fn(),
  getKdeConnectTelephony: vi.fn(),
  phoneGetSmsConversations: vi.fn(),
}));

import {
  getPhoneDeviceInfo,
  getPhoneBattery,
  getPhoneThermal,
  getPhoneStorage,
  getPhoneMemory,
  getPhoneScreen,
  getPhoneNetwork,
  getPhoneActivity,
  getKdeConnectBattery,
  getKdeConnectNotifications,
  getKdeConnectMpris,
  getKdeConnectTelephony,
  phoneGetSmsConversations,
} from '../../lib/fleet-api';

const mDeviceInfo = vi.mocked(getPhoneDeviceInfo);
const mBattery = vi.mocked(getPhoneBattery);
const mThermal = vi.mocked(getPhoneThermal);
const mStorage = vi.mocked(getPhoneStorage);
const mMemory = vi.mocked(getPhoneMemory);
const mScreen = vi.mocked(getPhoneScreen);
const mNetwork = vi.mocked(getPhoneNetwork);
const mActivity = vi.mocked(getPhoneActivity);
const mKdeBattery = vi.mocked(getKdeConnectBattery);
const mKdeNotifications = vi.mocked(getKdeConnectNotifications);
const mKdeMpris = vi.mocked(getKdeConnectMpris);
const mKdeTelephony = vi.mocked(getKdeConnectTelephony);
const mSmsConversations = vi.mocked(phoneGetSmsConversations);

function resolveAll() {
  mDeviceInfo.mockResolvedValue({ model: 'Test Phone', android_version: '14', api_level: 34 } as any);
  mBattery.mockResolvedValue({ level: 80, charging: false } as any);
  mThermal.mockResolvedValue({ battery_temp_c: 35, cpu_temp_c: 45 } as any);
  mStorage.mockResolvedValue({ used_gb: 20, free_gb: 50, total_gb: 70, used_pct: 28 } as any);
  mMemory.mockResolvedValue({ total_mb: 8192, available_mb: 4096 } as any);
  mScreen.mockResolvedValue({ on: true } as any);
  mNetwork.mockResolvedValue({ wifi_ssid: 'HomeWiFi' } as any);
  mActivity.mockResolvedValue({ package: 'com.test.app', activity: 'MainActivity' } as any);
  mKdeBattery.mockResolvedValue(null as any);
  mKdeNotifications.mockResolvedValue([]);
  mKdeMpris.mockResolvedValue(null as any);
  mKdeTelephony.mockResolvedValue(null as any);
}

function rejectAll() {
  [mDeviceInfo, mBattery, mThermal, mStorage, mMemory, mScreen, mNetwork, mActivity].forEach((m) =>
    m.mockRejectedValue(new Error('adb unreachable'))
  );
  [mKdeBattery, mKdeNotifications, mKdeMpris, mKdeTelephony].forEach((m) =>
    m.mockRejectedValue(new Error('kde unreachable'))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveAll();
  mSmsConversations.mockResolvedValue([] as any);
});

describe('PhonePage (D/E/L/R/I/M state matrix)', () => {
  it('E empty: no phone server shows "No Phone Connected"', async () => {
    render(<PhonePage servers={[]} />);

    await waitFor(() => expect(screen.getByText('No Phone Connected')).toBeInTheDocument());
  });

  it('D populated: phone server shows the model name and connected badges', async () => {
    render(<PhonePage servers={[phoneServer]} />);

    await waitFor(() => expect(screen.getByText('Test Phone')).toBeInTheDocument());
    expect(screen.getByText('ADB: Connected')).toBeInTheDocument();
    expect(screen.getByText('KDE: Connected')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('R robustness: failing probes render offline badges without crashing', async () => {
    rejectAll();

    render(<PhonePage servers={[phoneServer]} />);

    await waitFor(() => expect(screen.getByText('Test Phone')).toBeInTheDocument());
    expect(screen.getByText('ADB: Offline')).toBeInTheDocument();
    expect(screen.getByText('KDE: Offline')).toBeInTheDocument();
  });

  it('I interaction: SMS refresh button calls phoneGetSmsConversations', async () => {
    render(<PhonePage servers={[phoneServer]} />);

    await waitFor(() => expect(screen.getByText('Test Phone')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /↻/ })[0]);

    await waitFor(() => expect(mSmsConversations).toHaveBeenCalledWith('phone-1'));
  });

  it('M modal: no dialog renders on PhonePage', async () => {
    render(<PhonePage servers={[phoneServer]} />);

    await waitFor(() => expect(screen.getByText('Test Phone')).toBeInTheDocument());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
