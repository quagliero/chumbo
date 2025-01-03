export interface User {
  user_id: string;
  display_name: string;
  league_id: string;
  metadata: {
    avatar: string;
    team_name: string;
  };
}

export interface ExtendedUser extends User {
  avatar: string;
  is_bot: boolean | null;
  is_owner: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any | null;
  metadata: User["metadata"] & {
    [key: string]: string;
  };
}
