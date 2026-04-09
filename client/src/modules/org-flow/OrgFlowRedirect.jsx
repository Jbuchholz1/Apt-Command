import ModuleSplash from '../../components/ModuleSplash';

export default function OrgFlowRedirect() {
  const handleComplete = () => {
    window.open('https://aptorgflow.com/', '_blank');
    window.history.back();
  };

  return (
    <ModuleSplash
      text="Who else can I be helping?"
      hashtag="#GiveRespectGetRespect"
      onComplete={handleComplete}
    />
  );
}
