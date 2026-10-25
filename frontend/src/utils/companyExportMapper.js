export function mapCompanyForExport(company) {
  return {
    companyId: company.business_id,
    name: company.name,
    registrationDate: company.registration_date,
    status: company.status,
    address: {
      street: company.address,
      postalCode: company.postal_code,
      city: company.city,
    },
  };
}
