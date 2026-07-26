export interface AppCredentialProps {
  id: string;
  /** Owning agency. App credentials are always tenant-scoped (NOT NULL). */
  tenantId: string;
  /** Optional branch scope. Null = agency-wide (visible for every branch). */
  branchId?: string | null;
  name: string;
  username: string;
  /**
   * Plaintext password. The domain/application layers always work with the
   * plaintext value; encryption-at-rest is an infrastructure concern handled
   * by the repository (encrypt-on-save / decrypt-on-read).
   */
  password: string;
  /** When true, the app requires an authentication code (authCode must be set). */
  needsAuthCode?: boolean;
  /** Plaintext auth code — encrypted at rest by the repository, like password. */
  authCode?: string | null;
  /** Link to download or access the app. */
  appUrl?: string | null;
  /** Link to usage instructions. */
  instructionsUrl?: string | null;
  /** Plaintext instructions password — encrypted at rest, like password. */
  instructionsPassword?: string | null;
  isActive: boolean;
  /**
   * When true, the credential is automatically shown on every appointment of
   * its agency (restricted to branchId's appointments when set) without an
   * explicit appointment link.
   */
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class AppCredentialEntity {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly name: string;
  readonly username: string;
  readonly password: string;
  readonly needsAuthCode: boolean;
  readonly authCode: string | null;
  readonly appUrl: string | null;
  readonly instructionsUrl: string | null;
  readonly instructionsPassword: string | null;
  readonly isActive: boolean;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: AppCredentialProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.branchId = props.branchId ?? null;
    this.name = props.name;
    this.username = props.username;
    this.password = props.password;
    this.needsAuthCode = props.needsAuthCode ?? false;
    this.authCode = props.authCode ?? null;
    this.appUrl = props.appUrl ?? null;
    this.instructionsUrl = props.instructionsUrl ?? null;
    this.instructionsPassword = props.instructionsPassword ?? null;
    this.isActive = props.isActive;
    this.isDefault = props.isDefault ?? false;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
