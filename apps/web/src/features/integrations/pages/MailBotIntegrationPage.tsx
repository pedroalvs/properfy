import { MAIL_KEY_TYPE } from '../components/machineKeyType';
import { MachineKeyIntegrationPage } from './MachineKeyIntegrationPage';

/** Own page of the Mail Bot - AutoLabs inbound integration (API keys), at /integrations/mail-bot. AM-only (guarded in the router). */
export function MailBotIntegrationPage() {
  return <MachineKeyIntegrationPage keyType={MAIL_KEY_TYPE} />;
}
