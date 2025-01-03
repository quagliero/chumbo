export interface Manager {
  id: string;
  name: string;
  teamName: string;
  userId: string[];
  teamId: string;
  firstPlace: number[];
  secondPlace: number[];
  scoringCrowns?: number;
  sleeper: {
    id: string;
    display_name: string;
  };
}
