export interface AppCredentialProps {
  id: string;
  /** Owning agency. App credentials are always tenant-scoped (NOT NULL). */
  tenantId: string;
  name: string;
  username: string;
  /**
   * Plaintext password. The domain/application layers always work with the
   * plaintext value; encryption-at-rest is an infrastructure concern handled
   * by the repository (encrypt-on-save / decrypt-on-read).
   */
  password: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class AppCredentialEntity {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly username: string;
  readonly password: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: AppCredentialProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.username = props.username;
    this.password = props.password;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
