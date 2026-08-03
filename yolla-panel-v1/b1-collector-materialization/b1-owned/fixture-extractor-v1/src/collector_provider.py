from .fixture_extractor_pipeline import provider_status

class CollectorProvider:
    provider_id = 'B1_FIXTURE_COLLECTOR_PROVIDER_V1'
    def build_view_model(self, result):
        return provider_status(result)
