import { FY_KEY_TYPE } from '../components/machineKeyType';
import { MachineKeyIntegrationPage } from './MachineKeyIntegrationPage';

/** Own page of the Fy inbound integration (API keys), at /integrations/fy-api. AM-only (guarded in the router). */
export function FyIntegrationPage() {
  return <MachineKeyIntegrationPage keyType={FY_KEY_TYPE} />;
}
