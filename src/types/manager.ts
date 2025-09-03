export interface Manager {
  id: string;
  name: string;
  teamName: string;
  userId: string[];
  teamId: string;
  sleeper: {
    id: string;
    display_name: string;
  };
}
