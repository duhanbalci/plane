# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0125_issue_properties")]

    operations = [
        migrations.AddField(
            model_name="project",
            name="is_epic_enabled",
            field=models.BooleanField(default=False),
        )
    ]
